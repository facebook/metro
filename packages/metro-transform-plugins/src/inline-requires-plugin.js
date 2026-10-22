/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 */

import type {PluginObj} from '@babel/core';
import typeof * as Babel from '@babel/core';
import type {NodePath, Scope} from '@babel/traverse';
import type {
  CallExpression,
  Expression,
  MemberExpression,
  Node,
  Program,
  Statement,
} from '@babel/types';

type Types = Babel['types'];

export type PluginOptions = Readonly<{
  ignoredRequires?: ReadonlyArray<string>,
  inlineableCalls?: ReadonlyArray<string>,
  nonMemoizedModules?: ReadonlyArray<string>,
  memoizeCalls?: boolean,
}>;

export type State = {
  opts?: PluginOptions,
  ignoredRequires: Set<string>,
  inlineableCalls: Set<string>,
  membersAssigned: Map<string, Set<string>>,
  ...
};

/**
 * This transform inlines top-level require(...) aliases with to enable lazy
 * loading of dependencies. It is able to inline both single references and
 * child property references.
 *
 * For instance:
 *     var Foo = require('foo');
 *     f(Foo);
 *
 * Will be transformed into:
 *     f(require('foo'));
 *
 * When the assignment expression has a property access, it will be inlined too,
 * keeping the property. For instance:
 *     var Bar = require('foo').bar;
 *     g(Bar);
 *
 * Will be transformed into:
 *     g(require('foo').bar);
 *
 * Destructuring also works the same way. For instance:
 *     const {Baz, qux: Qux} = require('foo');
 *     h(Baz, Qux);
 *
 * Is also successfully inlined into:
 *     h(require('foo').Baz, require('foo').qux);
 *
 * With `memoizeCalls`, destructured properties share one memoized module.
 * Destructuring with defaults, rest elements, nesting or computed keys is not
 * inlined.
 */
export default ({types: t, traverse}: Babel): PluginObj<State> => ({
  name: 'inline-requires',
  visitor: {
    Program: {
      enter() {},
      exit(path: NodePath<Program>, state: State): void {
        const ignoredRequires = new Set<string>();
        const inlineableCalls = new Set(['require']);
        const nonMemoizedModules = new Set<string>();
        let memoizeCalls = false;
        const opts = state.opts;

        if (opts != null) {
          opts.ignoredRequires?.forEach(name => ignoredRequires.add(name));
          opts.inlineableCalls?.forEach(name => inlineableCalls.add(name));
          opts.nonMemoizedModules?.forEach(name =>
            nonMemoizedModules.add(name),
          );
          memoizeCalls = opts.memoizeCalls ?? false;
        }

        const programNode = path.scope.block;
        if (programNode.type !== 'Program') {
          return;
        }
        const program: Program = programNode;

        // Inlines `const {a, b: c} = require('m')` by replacing each reference
        // to `a` or `c` with `require('m').a` or `require('m').b`. When calls
        // are memoized, all properties share one memoized module, so each
        // scope requires `m` at most once.
        function inlineDestructuredRequire(
          {
            declarationPath,
            moduleName,
            requireFnName,
            properties,
          }: InlineableDestructuring,
          state: State,
        ): void {
          const references: Array<{key: string, referencePath: NodePath<>}> =
            [];
          for (const {key, localName} of properties) {
            const binding = declarationPath.scope.getBinding(localName);
            if (
              binding == null ||
              binding.constantViolations.length > 0 ||
              isExcludedMemberAssignment(moduleName, key, state)
            ) {
              return;
            }
            for (const referencePath of binding.referencePaths) {
              references.push({key, referencePath});
            }
          }
          // A memoized require is only assigned by the first reference in a
          // scope, so references are replaced in source order.
          references.sort(
            (a, b) =>
              (a.referencePath.node.start ?? 0) -
              (b.referencePath.node.start ?? 0),
          );

          const declarator = declarationPath.node;
          const initPath = declarationPath.get('init');
          if (
            declarator.type !== 'VariableDeclarator' ||
            declarator.init == null ||
            Array.isArray(initPath)
          ) {
            return;
          }
          const init: Expression = declarator.init;
          const initLoc = getNearestLocFromPath(initPath);
          deleteLocation(init);
          traverse(init, {
            noScope: true,
            enter: path => deleteLocation(path.node),
          });

          const getRequireExpr = () => {
            const refExpr = t.cloneDeep(init);
            // $FlowFixMe[prop-missing]
            refExpr.METRO_INLINE_REQUIRES_INIT_LOC = initLoc;
            return refExpr;
          };
          const getMember = (object: Expression, key: string) =>
            t.isValidIdentifier(key)
              ? t.memberExpression(object, t.identifier(key))
              : t.memberExpression(object, t.stringLiteral(key), true);

          let memoVarName: ?string = null;
          if (
            memoizeCalls &&
            references.length > 0 &&
            !nonMemoizedModules.has(moduleName)
          ) {
            const name = path.scope.generateUid(moduleName);
            declarationPath.remove();
            if (
              addStmtToBlock(
                program,
                t.variableDeclaration('var', [
                  t.variableDeclarator(t.identifier(name)),
                ]),
                0,
              )
            ) {
              memoVarName = name;
            }
          }

          let thrown = false;
          const scopesWithInlinedRequire = new Set<Scope>();
          for (const {key, referencePath} of references) {
            try {
              referencePath.scope.rename(requireFnName);
              if (memoVarName == null) {
                referencePath.replaceWith(getMember(getRequireExpr(), key));
                continue;
              }
              referencePath.scope.rename(memoVarName);
              const memoOrCall = t.logicalExpression(
                '||',
                t.identifier(memoVarName),
                t.assignmentExpression(
                  '=',
                  t.identifier(memoVarName),
                  getRequireExpr(),
                ),
              );
              // Reuse the memoized module directly once this scope has
              // assigned it, as for identifier aliases above.
              if (!isDirectlyEnclosedByBlock(t, referencePath)) {
                referencePath.replaceWith(getMember(memoOrCall, key));
              } else if (scopesWithInlinedRequire.has(referencePath.scope)) {
                referencePath.replaceWith(
                  getMember(t.identifier(memoVarName), key),
                );
              } else {
                referencePath.replaceWith(getMember(memoOrCall, key));
                scopesWithInlinedRequire.add(referencePath.scope);
              }
            } catch (error) {
              thrown = true;
            }
          }

          // If a replacement failed (e.g. replacing a type annotation),
          // avoid removing the initial require just to be safe.
          if (!thrown && declarationPath.node != null) {
            declarationPath.remove();
          }
        }

        path.scope.crawl();
        path.traverse<State>(
          {
            CallExpression(path, state) {
              const destructuring = parseInlineableDestructuring(path, state);
              if (destructuring != null) {
                inlineDestructuredRequire(destructuring, state);
                return;
              }

              const parseResult =
                parseInlineableAlias(path, state) ||
                parseInlineableMemberAlias(path, state);

              if (parseResult == null) {
                return;
              }
              const {declarationPath, moduleName, requireFnName} = parseResult;
              const maybeInit = declarationPath.node.init;
              const name = declarationPath.node.id
                ? declarationPath.node.id.name
                : null;

              const binding =
                name == null ? null : declarationPath.scope.getBinding(name);
              if (
                maybeInit == null ||
                !t.isExpression(maybeInit) ||
                binding == null ||
                binding.constantViolations.length > 0
              ) {
                return;
              }
              const init: Expression = maybeInit;
              const initPath = declarationPath.get('init');

              if (Array.isArray(initPath)) {
                return;
              }

              const initLoc = getNearestLocFromPath(initPath);

              deleteLocation(init);
              traverse(init, {
                noScope: true,
                enter: path => deleteLocation(path.node),
              });

              let thrown = false;
              const memoVarName = parseResult.identifierName;

              // Whether the module has a "var foo" at program scope, used to
              // store the result of a require call if memoizeCalls is true.
              let hasMemoVar = false;
              if (
                memoizeCalls &&
                // Don't add a var init statement if there are no references to
                // the lvalue of the require assignment.
                binding.referencePaths.length > 0 &&
                // Some modules should never be memoized even though they
                // may be inlined.
                !nonMemoizedModules.has(moduleName)
              ) {
                // create var init statement
                const varInitStmt = t.variableDeclaration('var', [
                  t.variableDeclarator(t.identifier(memoVarName)),
                ]);
                // Must remove the declaration path
                declarationPath.remove();
                hasMemoVar = addStmtToBlock(programNode, varInitStmt, 0);
              }

              function getMemoOrCallExpr() {
                const refExpr = t.cloneDeep(init);
                // $FlowFixMe[prop-missing]
                refExpr.METRO_INLINE_REQUIRES_INIT_LOC = initLoc;
                return t.logicalExpression(
                  '||',
                  t.identifier(memoVarName),
                  t.assignmentExpression(
                    '=',
                    t.identifier(memoVarName),
                    refExpr,
                  ),
                );
              }

              const scopesWithInlinedRequire = new Set<Scope>();
              for (const referencePath of binding.referencePaths) {
                excludeMemberAssignment(moduleName, referencePath, state);
                try {
                  referencePath.scope.rename(requireFnName);
                  if (hasMemoVar) {
                    referencePath.scope.rename(memoVarName);
                    // Swap the local reference with (v || v = require(m)),
                    // unless it is directly enclosed.
                    if (!isDirectlyEnclosedByBlock(t, referencePath)) {
                      referencePath.replaceWith(getMemoOrCallExpr());
                      continue;
                    }
                    // if the current scope already has a (v || v = require(m))
                    // expression for module m, use identifier reference v
                    // instead. Else use the full (v || v = require(m)) and
                    // register the current scope for subsequent references.
                    if (scopesWithInlinedRequire.has(referencePath.scope)) {
                      referencePath.replaceWith(t.identifier(memoVarName));
                    } else {
                      referencePath.replaceWith(getMemoOrCallExpr());
                      scopesWithInlinedRequire.add(referencePath.scope);
                    }
                  } else {
                    const refExpr = t.cloneDeep(init);
                    // $FlowFixMe[prop-missing]
                    refExpr.METRO_INLINE_REQUIRES_INIT_LOC = initLoc;
                    referencePath.replaceWith(refExpr);
                  }
                } catch (error) {
                  thrown = true;
                }
              }

              // If a replacement failed (e.g. replacing a type annotation),
              // avoid removing the initial require just to be safe.
              if (!thrown && declarationPath.node != null) {
                declarationPath.remove();
              }
            },
          },
          {
            ignoredRequires,
            inlineableCalls,
            membersAssigned: new Map(),
          },
        );
      },
    },
  },
});

function excludeMemberAssignment(
  moduleName: string,
  referencePath: NodePath<>,
  state: State,
) {
  const assignment: ?Node = referencePath.parentPath?.parent;

  if (assignment?.type !== 'AssignmentExpression') {
    return;
  }

  const left = assignment.left;
  if (left.type !== 'MemberExpression' || left.object !== referencePath.node) {
    return;
  }

  const memberPropertyName = getMemberPropertyName(left);
  if (memberPropertyName == null) {
    return;
  }

  let membersAssigned = state.membersAssigned.get(moduleName);
  if (membersAssigned == null) {
    membersAssigned = new Set();
    state.membersAssigned.set(moduleName, membersAssigned);
  }
  membersAssigned.add(memberPropertyName);
}

function isExcludedMemberAssignment(
  moduleName: string,
  memberPropertyName: string,
  state: State,
) {
  const excludedAliases = state.membersAssigned.get(moduleName);
  return excludedAliases != null && excludedAliases.has(memberPropertyName);
}

function getMemberPropertyName(node: MemberExpression): ?string {
  if (node.property.type === 'Identifier') {
    return node.property.name;
  }
  if (node.property.type === 'StringLiteral') {
    return node.property.value;
  }
  return null;
}

function deleteLocation(node: Node) {
  delete node.start;
  delete node.end;
  delete node.loc;
}

function parseInlineableAlias(
  path: NodePath<CallExpression>,
  state: State,
): ?{
  declarationPath: NodePath<Node>,
  moduleName: string,
  requireFnName: string,
  identifierName: string,
} {
  const module = getInlineableModule(path, state);
  if (module == null) {
    return null;
  }

  const {moduleName, requireFnName} = module;
  const parentPath = path.parentPath;
  if (parentPath == null) {
    return null;
  }
  const grandParentPath = parentPath.parentPath;
  if (grandParentPath == null) {
    return null;
  }

  if (path.parent.type !== 'VariableDeclarator') {
    return null;
  }

  const variableDeclarator = path.parent;

  if (variableDeclarator.id.type !== 'Identifier') {
    return null;
  }

  const identifier = variableDeclarator.id;

  const isValid =
    parentPath.parent.type === 'VariableDeclaration' &&
    grandParentPath.parent.type === 'Program';

  return !isValid || parentPath.node == null
    ? null
    : {
        declarationPath: parentPath,
        moduleName,
        requireFnName,
        identifierName: identifier.name,
      };
}

function parseInlineableMemberAlias(
  path: NodePath<CallExpression>,
  state: State,
): ?{
  declarationPath: NodePath<Node>,
  moduleName: string,
  requireFnName: string,
  identifierName: string,
} {
  const module = getInlineableModule(path, state);
  if (module == null) {
    return null;
  }

  const {moduleName, requireFnName} = module;
  const parent = path.parent;
  const parentPath = path.parentPath;
  if (parentPath == null) {
    return null;
  }
  const grandParentPath = parentPath.parentPath;
  if (grandParentPath == null) {
    return null;
  }

  if (parent.type !== 'MemberExpression') {
    return null;
  }

  const memberExpression: MemberExpression = parent;

  if (parentPath.parent.type !== 'VariableDeclarator') {
    return null;
  }
  const variableDeclarator = parentPath.parent;

  if (variableDeclarator.id.type !== 'Identifier') {
    return null;
  }

  const identifier = variableDeclarator.id;

  if (
    grandParentPath.parent.type !== 'VariableDeclaration' ||
    grandParentPath.parentPath?.parent.type !== 'Program' ||
    grandParentPath.node == null
  ) {
    return null;
  }

  const memberPropertyName = getMemberPropertyName(memberExpression);

  return memberPropertyName == null ||
    isExcludedMemberAssignment(moduleName, memberPropertyName, state)
    ? null
    : {
        declarationPath: grandParentPath,
        moduleName,
        requireFnName,
        identifierName: identifier.name,
      };
}

type InlineableDestructuring = {
  declarationPath: NodePath<Node>,
  moduleName: string,
  requireFnName: string,
  properties: ReadonlyArray<{key: string, localName: string}>,
};

// Matches a top-level `const {a, 'b': c} = require('m')`. Patterns with
// defaults, rest elements, nesting or computed keys are left alone.
function parseInlineableDestructuring(
  path: NodePath<CallExpression>,
  state: State,
): ?InlineableDestructuring {
  const module = getInlineableModule(path, state);
  if (module == null) {
    return null;
  }
  const declarationPath = path.parentPath;
  if (
    declarationPath == null ||
    declarationPath.node.type !== 'VariableDeclarator' ||
    declarationPath.node.id.type !== 'ObjectPattern' ||
    declarationPath.parent.type !== 'VariableDeclaration' ||
    declarationPath.parentPath?.parent.type !== 'Program'
  ) {
    return null;
  }

  const properties: Array<{key: string, localName: string}> = [];
  for (const property of declarationPath.node.id.properties) {
    if (
      property.type !== 'ObjectProperty' ||
      property.computed === true ||
      property.value.type !== 'Identifier'
    ) {
      return null;
    }
    let key;
    if (property.key.type === 'Identifier') {
      key = property.key.name;
    } else if (property.key.type === 'StringLiteral') {
      key = property.key.value;
    } else {
      return null;
    }
    properties.push({key, localName: property.value.name});
  }

  return {
    declarationPath,
    moduleName: module.moduleName,
    requireFnName: module.requireFnName,
    properties,
  };
}

function getInlineableModule(
  path: NodePath<CallExpression>,
  state: State,
): ?{moduleName: string, requireFnName: string} {
  const node = path.node;
  const isInlineable =
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    state.inlineableCalls.has(node.callee.name) &&
    node['arguments'].length >= 1;

  if (!isInlineable) {
    return null;
  }

  // require('foo');
  let moduleName =
    node['arguments'][0].type === 'StringLiteral'
      ? node['arguments'][0].value
      : null;

  // require(require.resolve('foo'));
  if (moduleName == null) {
    const callNode = node['arguments'][0];
    if (
      callNode.type === 'CallExpression' &&
      callNode.callee.type === 'MemberExpression' &&
      callNode.callee.object.type === 'Identifier'
    ) {
      const callee = callNode.callee;
      moduleName =
        callee.object.type === 'Identifier' &&
        state.inlineableCalls.has(callee.object.name) &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'resolve' &&
        callNode['arguments'].length >= 1 &&
        callNode['arguments'][0].type === 'StringLiteral'
          ? callNode['arguments'][0].value
          : null;
    }
  }

  // Check if require is in any parent scope
  const fnName = node.callee.name;
  if (fnName == null) {
    return null;
  }
  const isRequireInScope = path.scope.getBinding(fnName) != null;

  return moduleName == null ||
    state.ignoredRequires.has(moduleName) ||
    moduleName.startsWith('@babel/runtime/') ||
    isRequireInScope
    ? null
    : {moduleName, requireFnName: fnName};
}

function getNearestLocFromPath(path: NodePath<>): ?BabelSourceLocation {
  let current: ?(NodePath<> | NodePath<Node>) = path;
  while (current && !current.node.loc) {
    current = current.parentPath;
  }
  return current?.node.loc;
}

// check if a node is a branch
function isBranch(t: Types, node: Node) {
  return (
    t.isIfStatement(node) ||
    t.isLogicalExpression(node) ||
    t.isConditionalExpression(node) ||
    t.isSwitchStatement(node) ||
    t.isSwitchCase(node) ||
    t.isForStatement(node) ||
    t.isForInStatement(node) ||
    t.isForOfStatement(node) ||
    t.isWhileStatement(node)
  );
}

function isDirectlyEnclosedByBlock(t: Types, path: NodePath<Node>) {
  let curPath: ?NodePath<Node> = path;
  while (curPath) {
    if (isBranch(t, curPath.node)) {
      return false;
    }
    if (t.isBlockStatement(curPath.node)) {
      return true;
    }
    curPath = curPath.parentPath;
  }
  return true;
}

// insert statement to the beginning of the scope block
function addStmtToBlock(block: Program, stmt: Statement, idx: number): boolean {
  const scopeBody = block.body;
  if (Array.isArray(scopeBody)) {
    // if the code is inside global scope
    scopeBody.splice(idx, 0, stmt);
    return true;
  } else if (scopeBody && Array.isArray(scopeBody.body)) {
    // if the code is inside function scope
    scopeBody.body.splice(idx, 0, stmt);
    return true;
  } else {
    return false;
  }
}
