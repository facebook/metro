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

const nullthrows = require('fbjs/lib/nullthrows');

const {traverse, types} = require('babel-core');
const prettyPrint = require('babel-generator').default;

type AST = Object;

class Replacement {
  nameToIndex: Map<string, number>;
  nextIndex: number;

  constructor() {
    this.nameToIndex = new Map();
    this.nextIndex = 0;
  }

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

  getIndex(stringLiteralOrTemplateLiteral) {
    const name = stringLiteralOrTemplateLiteral.quasis
      ? stringLiteralOrTemplateLiteral.quasis[0].value.cooked
      : stringLiteralOrTemplateLiteral.value;
    let index = this.nameToIndex.get(name);
    if (index !== undefined) {
      return index;
    }
    index = this.nextIndex++;
    this.nameToIndex.set(name, index);
    return index;
  }

  getNames() {
    return Array.from(this.nameToIndex.keys());
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
  names: Array<string>;

  constructor(names) {
    this.replacement = new Replacement();
    this.names = names;
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

  getIndex(memberExpression) {
    const id = memberExpression.property.value;
    if (id in this.names) {
      return this.replacement.getIndex({value: this.names[id]});
    }

    throw new Error(
      `${id} is not a known module ID. Existing mappings: ${this.names
        .map((n, i) => `${i} => ${n}`)
        .join(', ')}`,
    );
  }

  getNames() {
    return this.replacement.getNames();
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

function collectDependencies(ast, replacement, dependencyMapIdentifier) {
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
        if (visited.has(node)) {
          return;
        }
        if (isRequireCall(node.callee)) {
          const arg = replacement.getRequireCallArg(node);
          const index = replacement.getIndex(arg);
          node.arguments = replacement.makeArgs(
            types.numericLiteral(index),
            arg,
            state.dependencyMapIdentifier,
          );
          visited.add(node);
        }
      },
    },
    null,
    traversalState,
  );

  return {
    dependencies: replacement.getNames(),
    dependencyMapName: nullthrows(traversalState.dependencyMapIdentifier).name,
  };
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

const xp = (module.exports = (ast: AST) =>
  collectDependencies(ast, new Replacement()));

xp.forOptimization = (
  ast: AST,
  names: Array<string>,
  dependencyMapName?: string,
) =>
  collectDependencies(
    ast,
    new ProdReplacement(names),
    dependencyMapName ? types.identifier(dependencyMapName) : undefined,
  );

xp.InvalidRequireCallError = InvalidRequireCallError;
