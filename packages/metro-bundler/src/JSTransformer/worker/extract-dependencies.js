/**
 * Copyright (c) 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @format
 */

'use strict';

const babel = require('babel-core');
const babylon = require('babylon');

/**
 * Extracts dependencies (module IDs imported with the `require` function) from
 * a string containing code. This walks the full AST for correctness (versus
 * using, for example, regular expressions, that would be faster but inexact.)
 *
 * The result of the dependency extraction is an de-duplicated array of
 * dependencies, and an array of offsets to the string literals with module IDs.
 * The index points to the opening quote.
 *
 * Note the technique of recognizing the identifier "require" is not proper
 * because it ignores that the scope may have reassigned or shadowed that value,
 * but it's a tradeoff for simplicity.
 */

function extractDependencies(code: string, filename: string) {
  const ast = babylon.parse(code, {sourceType: 'module'});
  const dependencies = new Set();
  const dependencyOffsets = [];

  function pushDependency(nodeArgs, parentType) {
    const arg = nodeArgs[0];
    if (nodeArgs.length != 1 || arg.type !== 'StringLiteral') {
      // Dynamic requires directly inside of a try statement are considered optional dependencies
      if (parentType === 'TryStatement') {
        return;
      }
      throw new Error(
        `require() must have a single string literal argument: ${filename}:${arg
          .loc.start.line - 1}`,
      );
    }
    dependencyOffsets.push(arg.start);
    dependencies.add(arg.value);
  }

  babel.traverse(ast, {
    CallExpression(path) {
      const node = path.node;
      const callee = node.callee;
      const parent = path.scope.parentBlock;
      if (callee.type === 'Identifier' && callee.name === 'require') {
        pushDependency(node.arguments, parent.type);
      }
      if (callee.type !== 'MemberExpression') {
        return;
      }
      const obj = callee.object;
      const prop = callee.property;
      if (
        obj.type === 'Identifier' &&
        obj.name === 'require' &&
        !callee.computed &&
        prop.name === 'async'
      ) {
        pushDependency(node.arguments);
      }
    },
  });

  return {dependencyOffsets, dependencies: Array.from(dependencies)};
}

module.exports = extractDependencies;
