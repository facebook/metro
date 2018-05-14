/**
 * Copyright (c) 2016-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

'use strict';

const nullthrows = require('fbjs/lib/nullthrows');
const types = require('@babel/types');

const babelTemplate = require('@babel/template').default;
const generate = require('@babel/generator').default;
const traverse = require('@babel/traverse').default;

import type {TransformResultDependency} from '../types.flow';
import type {Ast} from '@babel/core';

export type DynamicRequiresBehavior = 'throwAtRuntime' | 'reject';
type Options = {|
  +dynamicRequires: DynamicRequiresBehavior,
  +asyncRequireModulePath: string,
|};

type Context = {
  +asyncRequireModulePath: string,
  +dynamicRequires: DynamicRequiresBehavior,
  dependencies: Array<{|+name: string, isAsync: boolean|}>,
  nameToIndex: Map<string, number>,
};

type CollectedDependencies = {|
  +dependencyMapName: string,
  +dependencies: $ReadOnlyArray<TransformResultDependency>,
|};

/**
 * Transform all the calls to `require()` and `import()` in a file into ID-
 * independent code, and return the list of dependencies. For example, a call
 * like `require('Foo')` could be transformed to `require(_depMap[3], 'Foo')`
 * where `_depMap` is provided by the outer scope. As such, we don't need to
 * know the actual module ID. The second argument is only provided for debugging
 * purposes.
 */
function collectDependencies(
  ast: Ast,
  options: Options,
): CollectedDependencies {
  const visited = new WeakSet();
  const {asyncRequireModulePath, dynamicRequires} = options;
  const context = {
    asyncRequireModulePath,
    dynamicRequires,
    dependencies: [],
    nameToIndex: new Map(),
  };
  const visitor = {
    Program(path, state) {
      state.dependencyMapIdentifier = path.scope.generateUidIdentifier(
        'dependencyMap',
      );
    },
    CallExpression(path, state) {
      const {dependencyMapIdentifier: depMapIdent} = state;
      const node = path.node;
      if (visited.has(node)) {
        return;
      }
      if (node.callee.type === 'Import') {
        processImportCall(context, path, node, depMapIdent);
        return;
      }
      if (isNativeRequireCall(path)) {
        const reqNode = processRequireCall(context, path, node, depMapIdent);
        visited.add(reqNode);
      }
    },
  };
  const traversalState = {dependencyMapIdentifier: null};
  traverse(ast, visitor, null, traversalState);
  return {
    dependencies: context.dependencies,
    dependencyMapName: nullthrows(traversalState.dependencyMapIdentifier).name,
  };
}

function isNativeRequireCall(path) {
  const node = path.node;
  const callee = node.callee;
  return (
    callee.type === 'Identifier' &&
    callee.name === 'require' &&
    path.scope.bindings['require'] == null
  );
}

function processImportCall(context, path, node, depMapIdent) {
  const [, name] = getModuleNameFromCallArgs('import', node, path);
  if (name == null) {
    throw invalidRequireOf('import', node);
  }
  const index = assignDependencyIndex(context, name, 'import');
  const mapLookup = createDepMapLookup(depMapIdent, index);
  const {asyncRequireModulePath} = context;
  const newImport = makeAsyncRequire({
    MODULE_ID: mapLookup,
    ASYNC_REQUIRE_PATH: {type: 'StringLiteral', value: asyncRequireModulePath},
  });
  path.replaceWith(newImport);
}

function processRequireCall(context, path, node, depMapIdent) {
  const [nameExpr, name] = getModuleNameFromCallArgs('require', node, path);
  if (name == null) {
    const {dynamicRequires} = context;
    switch (dynamicRequires) {
      case 'reject':
        throw invalidRequireOf('require', node);
      case 'throwAtRuntime':
        const newNode = makeDynamicRequireReplacement({NAME_EXPR: nameExpr});
        path.replaceWith(newNode);
        return newNode;
      default:
        (dynamicRequires: empty);
        throw new Error(`invalid dyn requires spec \`${dynamicRequires}\``);
    }
  }
  const index = assignDependencyIndex(context, name, 'require');
  const mapLookup = createDepMapLookup(depMapIdent, index);
  node.arguments = [mapLookup, nameExpr];
  return node;
}

const makeDynamicRequireReplacement = babelTemplate(
  "(function(name){throw new Error('Module `'+name+'` was required " +
    "dynamically. This is not supported by Metro bundler.')})(NAME_EXPR)",
);

/**
 * Extract the module name from `require` arguments. We support template
 * literal, for example one could write `require(`foo`)`.
 */
function getModuleNameFromCallArgs(type, node, path) {
  if (node.arguments.length !== 1) {
    throw invalidRequireOf(type, node);
  }

  const nameExpression = node.arguments[0];

  // Try to evaluate the first argument of the require() statement.
  // If it can be statically evaluated, resolve it.
  const result = path.get('arguments.0').evaluate();
  if (result.confident && typeof result.value === 'string') {
    return [nameExpression, result.value];
  }
  return [nameExpression, null];
}

/**
 * For each different module being required, we assign it an index in the
 * "dependency map". If we encounter the same module twice, it gets the same
 * index. A module required both asynchronously and synchronously is marked
 * as not being async.
 */
function assignDependencyIndex(
  context: Context,
  name: string,
  type: 'require' | 'import',
): number {
  let index = context.nameToIndex.get(name);
  if (index == null) {
    const isAsync = type === 'import';
    index = context.dependencies.push({name, isAsync}) - 1;
    context.nameToIndex.set(name, index);
    return index;
  }
  if (type === 'require') {
    context.dependencies[index].isAsync = false;
  }
  return index;
}

function createDepMapLookup(depMapIndent, index: number) {
  const indexLiteral = types.numericLiteral(index);
  return types.memberExpression(depMapIndent, indexLiteral, true);
}

const makeAsyncRequire = babelTemplate(
  `require(ASYNC_REQUIRE_PATH)(MODULE_ID)`,
);

function invalidRequireOf(type, node) {
  const str = generate(node).code;
  return new InvalidRequireCallError(type, str, node.loc.start);
}

class InvalidRequireCallError extends Error {
  callType: string;
  nodeString: string;
  location: string;

  constructor(callType, nodeString, loc) {
    super(
      `${loc.line}:${loc.column}: ` +
        `calls to \`${callType}\` expect exactly 1 string literal ` +
        `argument, but this was found: \`${nodeString}\`.`,
    );
    this.callType = callType;
    this.nodeString = nodeString;
    this.location = loc;
  }
}
collectDependencies.InvalidRequireCallError = InvalidRequireCallError;

module.exports = collectDependencies;
