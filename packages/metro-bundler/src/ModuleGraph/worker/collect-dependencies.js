/**
 * Copyright (c) 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 * @flow
 */

'use strict';

const babelTemplate = require('babel-template');
const nullthrows = require('fbjs/lib/nullthrows');

const {traverse, types} = require('babel-core');
const prettyPrint = require('babel-generator').default;

import type {TransformResultDependency} from '../types.flow';

class Replacement {
  nameToIndex: Map<string, number> = new Map();
  dependencies: Array<{|+name: string, isAsync: boolean|}> = [];
  replaceImports = true;

  getRequireCallArg(node) {
    const args = node.arguments;
    if (args.length !== 1 || !isLiteralString(args[0])) {
      throw new InvalidRequireCallError(
        'Calls to require() expect exactly 1 string literal argument, but ' +
          'this was found: ' +
          prettyPrint(node).code,
      );
    }
    return args[0];
  }

  getIndex(stringLiteralOrTemplateLiteral, isAsync: boolean) {
    const name = stringLiteralOrTemplateLiteral.quasis
      ? stringLiteralOrTemplateLiteral.quasis[0].value.cooked
      : stringLiteralOrTemplateLiteral.value;
    let index = this.nameToIndex.get(name);
    if (index !== undefined) {
      if (!isAsync) {
        this.dependencies[index].isAsync = false;
      }
      return index;
    }

    index = this.dependencies.push({name, isAsync}) - 1;
    this.nameToIndex.set(name, index);
    return index;
  }

  getDependencies(): $ReadOnlyArray<TransformResultDependency> {
    return this.dependencies;
  }

  makeArgs(newId, oldId, dependencyMapIdentifier) {
    const mapLookup = createMapLookup(dependencyMapIdentifier, newId);
    return [mapLookup, oldId];
  }
}

function getInvalidProdRequireMessage(node) {
  return (
    'Post-transform calls to require() expect 2 arguments, the first ' +
    'of which has the shape `_dependencyMapName[123]`, but this was found: ' +
    prettyPrint(node).code
  );
}

class ProdReplacement {
  replacement: Replacement;
  dependencies: $ReadOnlyArray<TransformResultDependency>;
  replaceImports = false;

  constructor(dependencies: $ReadOnlyArray<TransformResultDependency>) {
    this.replacement = new Replacement();
    this.dependencies = dependencies;
  }

  getRequireCallArg(node) {
    const args = node.arguments;
    if (args.length !== 2) {
      throw new InvalidRequireCallError(getInvalidProdRequireMessage(node));
    }
    const arg = args[0];
    if (
      !(
        arg.type === 'MemberExpression' &&
        arg.property &&
        arg.property.type === 'NumericLiteral'
      )
    ) {
      throw new InvalidRequireCallError(getInvalidProdRequireMessage(node));
    }
    return args[0];
  }

  getIndex(memberExpression, _: boolean) {
    const id = memberExpression.property.value;
    if (id in this.dependencies) {
      const dependency = this.dependencies[id];
      const xp = {value: dependency.name};
      return this.replacement.getIndex(xp, dependency.isAsync);
    }

    throw new Error(
      `${id} is not a known module ID. Existing mappings: ${this.dependencies
        .map((n, i) => `${i} => ${n.name}`)
        .join(', ')}`,
    );
  }

  getDependencies(): $ReadOnlyArray<TransformResultDependency> {
    return this.replacement.getDependencies();
  }

  makeArgs(newId, _, dependencyMapIdentifier) {
    const mapLookup = createMapLookup(dependencyMapIdentifier, newId);
    return [mapLookup];
  }
}

function createMapLookup(dependencyMapIdentifier, propertyIdentifier) {
  return types.memberExpression(
    dependencyMapIdentifier,
    propertyIdentifier,
    true,
  );
}

function collectDependencies(
  ast,
  replacement,
  dependencyMapIdentifier,
): {
  dependencies: $ReadOnlyArray<TransformResultDependency>,
  dependencyMapName: string,
} {
  const visited = new WeakSet();
  const traversalState = {dependencyMapIdentifier};
  traverse(
    ast,
    {
      Program(path, state) {
        if (!state.dependencyMapIdentifier) {
          state.dependencyMapIdentifier = path.scope.generateUidIdentifier(
            'dependencyMap',
          );
        }
      },

      CallExpression(path, state) {
        const node = path.node;
        if (replacement.replaceImports && node.callee.type === 'Import') {
          const reqNode = processImportCall(path, node, replacement, state);
          visited.add(reqNode);
          return;
        }
        if (visited.has(node)) {
          return;
        }
        if (!isRequireCall(node.callee)) {
          return;
        }
        const arg = replacement.getRequireCallArg(node);
        const index = replacement.getIndex(arg, false);
        node.arguments = replacement.makeArgs(
          types.numericLiteral(index),
          arg,
          state.dependencyMapIdentifier,
        );
        visited.add(node);
      },
    },
    null,
    traversalState,
  );

  return {
    dependencies: replacement.getDependencies(),
    dependencyMapName: nullthrows(traversalState.dependencyMapIdentifier).name,
  };
}

const makeAsyncRequire = babelTemplate(
  `require(BUNDLE_SEGMENTS_PATH).loadForModule(MODULE_ID).then(
    function() { return require(REQUIRE_ARGS); }
  )`,
);

function processImportCall(path, node, replacement, state) {
  const args = node.arguments;
  if (args.length !== 1 || !isLiteralString(args[0])) {
    throw new InvalidRequireCallError(
      'Calls to import() expect exactly 1 string literal argument, ' +
        'but this was found: ' +
        prettyPrint(node).code,
    );
  }
  const modulePath = args[0];
  const index = replacement.getIndex(modulePath, true);
  const newImport = makeAsyncRequire({
    REQUIRE_ARGS: replacement.makeArgs(
      types.numericLiteral(index),
      modulePath,
      state.dependencyMapIdentifier,
    ),
    MODULE_ID: createMapLookup(
      state.dependencyMapIdentifier,
      types.numericLiteral(index),
    ),
    BUNDLE_SEGMENTS_PATH: {
      type: 'StringLiteral',
      value: 'BundleSegments',
    },
  });
  path.replaceWith(newImport);
  // This is the inner require() call. We return it so it
  // gets marked as already visited.
  return newImport.expression.arguments[0].body.body[0].argument;
}

function isLiteralString(node) {
  return (
    node.type === 'StringLiteral' ||
    (node.type === 'TemplateLiteral' && node.quasis.length === 1)
  );
}

function isRequireCall(callee) {
  return callee.type === 'Identifier' && callee.name === 'require';
}

class InvalidRequireCallError extends Error {
  constructor(message) {
    super(message);
  }
}

const xp = (module.exports = (ast: Ast) =>
  collectDependencies(ast, new Replacement()));

xp.forOptimization = (
  ast: Ast,
  dependencies: $ReadOnlyArray<TransformResultDependency>,
  dependencyMapName?: string,
) =>
  collectDependencies(
    ast,
    new ProdReplacement(dependencies),
    dependencyMapName ? types.identifier(dependencyMapName) : undefined,
  );

xp.InvalidRequireCallError = InvalidRequireCallError;
