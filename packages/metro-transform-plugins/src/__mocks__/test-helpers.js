/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

const {transformSync} = require('@babel/core');
const generate = require('@babel/generator').default;
const t = require('@babel/types');

opaque type Code = string;
opaque type Plugin = () => {};
opaque type Options = {};

function makeTransformOptions(plugins, options) {
  return {
    ast: true,
    babelrc: false,
    browserslistConfigFile: false,
    code: false,
    compact: true,
    configFile: false,
    plugins: plugins.length
      ? plugins.map(plugin => [plugin, options])
      : [() => ({visitor: {}})],
    sourceType: 'module',
  };
}

function validateOutputAst(ast) {
  const seenNodes = new Set();
  t.traverseFast(ast, function enter(node) {
    if (seenNodes.has(node)) {
      throw new Error(
        'Found a duplicate ' +
          node.type +
          ' node in the output, which can cause' +
          ' undefined behavior in Babel.',
      );
    }
    seenNodes.add(node);
  });
}

function transformToAst(
  plugins: $ReadOnlyArray<Plugin>,
  code: Code,
  options: Options = {},
) {
  const ast = transformSync(code, makeTransformOptions(plugins, options)).ast;
  validateOutputAst(ast);
  return ast;
}

function transform(
  code: Code,
  plugins: $ReadOnlyArray<Plugin>,
  options: Options,
) {
  return generate(transformToAst(plugins, code, options)).code;
}

exports.compare = function (
  plugins: $ReadOnlyArray<Plugin>,
  code: Code,
  expected: Code,
  options: Options = {},
) {
  expect(transform(code, plugins, options)).toBe(transform(expected, [], {}));
};

exports.transformToAst = transformToAst;
