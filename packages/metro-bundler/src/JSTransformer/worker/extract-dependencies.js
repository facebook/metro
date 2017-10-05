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
function extractDependencies(code: string) {
  const ast = babylon.parse(code);
  const dependencies = new Set();
  const dependencyOffsets = [];

  function pushDependency(nodeArgs, tryCatchDepth) {
    const arg = nodeArgs[0];
    if (nodeArgs.length != 1 || arg.type !== 'StringLiteral') {
      if (tryCatchDepth === 0) {
        // Attempting to call require with a value that will throw and error production
        throw new Error('require() must have a single string literal argument');
      } else {
        // Attempting to call require with an invalid value, but handling the potential error
        return;
      }
    }
    dependencyOffsets.push(arg.start);
    dependencies.add(arg.value);
  }

  babel.traverse(ast, {
    CallExpression(path, state) {
      const node = path.node;
      const callee = node.callee;
      if (callee.type === 'Identifier' && callee.name === 'require') {
        pushDependency(node.arguments, state.tryCatchDepth);
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
        pushDependency(node.arguments, state.tryCatchDepth);
      }
    },
    /**
     * This visitor resets the try/catch counter in order to ensure that
     * require statments validity is checked within the scope of a reachable
     * block.
     */
    Function: {
      enter(path, state) {
        state.tryCatchHistroy.push(state.tryCatchDepth);
        state.tryCatchDepth = 0;
      },
      exit(path, state) {
        state.tryCatchDepth = state.tryCatchHistroy.pop();
      }
    },
    /**
     * This visitor tracks try/catch statements in order to ensure that
     * non-string literals required within such do not result in bundling
     * errors.
     */
    TryStatement: {
      enter(path, state) {
        if (path.node.handler !== null) {
          state.tryCatchDepth++;
        }
      },
      exit(path, state) {
        if (path.node.handler !== null) {
          state.tryCatchDepth--;
        }
      },
    },
  }, null, {tryCatchDepth: 0, tryCatchHistroy: []});

  return {dependencyOffsets, dependencies: Array.from(dependencies)};
}

module.exports = extractDependencies;
