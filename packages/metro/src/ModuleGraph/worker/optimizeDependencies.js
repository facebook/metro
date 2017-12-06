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

const {traverse} = require('babel-core');
const prettyPrint = require('babel-generator').default;

import type {TransformResultDependency} from '../types.flow';

type Context = {
  oldToNewIndex: Map<number, number>,
  dependencies: Array<TransformResultDependency>,
};

type Dependencies = $ReadOnlyArray<TransformResultDependency>;

function optimizeDependencies(
  ast: Ast,
  dependencies: Dependencies,
  dependencyMapName: string,
): Array<TransformResultDependency> {
  const visited = new WeakSet();
  const context = {oldToNewIndex: new Map(), dependencies: []};
  const visitor = {
    CallExpression(path) {
      const {node} = path;
      if (visited.has(node)) {
        return;
      }
      if (isRequireCall(node.callee)) {
        processRequireCall(node);
        visited.add(node);
      }
    },
    MemberExpression(path, state) {
      const {node} = path;
      if (visited.has(node)) {
        return;
      }
      if (isDepMapAccess(node, dependencyMapName)) {
        processDepMapAccess(context, node, dependencies);
        visited.add(node);
      }
    },
  };
  traverse(ast, visitor);
  return context.dependencies;
}

function isRequireCall(callee) {
  return callee.type === 'Identifier' && callee.name === 'require';
}

function processRequireCall(node) {
  if (node.arguments.length != 2) {
    throw new InvalidRequireCallError(
      'Post-transform calls to require() expect 2 arguments, the first ' +
        'of which has the shape `_dependencyMapName[123]`, ' +
        `but this was found: \`${prettyPrint(node).code}\``,
    );
  }
  node.arguments = [node.arguments[0]];
  return node;
}

function isDepMapAccess(node, depMapName: string): boolean {
  return (
    node.computed &&
    node.object.type === 'Identifier' &&
    node.object.name === depMapName &&
    node.property.type === 'NumericLiteral'
  );
}

function processDepMapAccess(context: Context, node, deps: Dependencies): void {
  const index = node.property.value;
  const newIx = translateDependencyIndex(context, deps, index);
  if (newIx !== node.property.value) {
    node.property.value = newIx;
  }
}

function translateDependencyIndex(
  context: Context,
  deps: Dependencies,
  index: number,
): number {
  let newIndex = context.oldToNewIndex.get(index);
  if (newIndex != null) {
    return newIndex;
  }
  const dep = deps[index];
  if (dep == null) {
    throw new Error(
      `${index} is not a known module index. Existing mappings: ${deps
        .map((n, i) => `${i} => ${n.name}`)
        .join(', ')}`,
    );
  }
  newIndex = context.dependencies.push(dep) - 1;
  context.oldToNewIndex.set(index, newIndex);
  return newIndex;
}

class InvalidRequireCallError extends Error {
  constructor(message) {
    super(message);
  }
}
optimizeDependencies.InvalidRequireCallError = InvalidRequireCallError;

module.exports = optimizeDependencies;
