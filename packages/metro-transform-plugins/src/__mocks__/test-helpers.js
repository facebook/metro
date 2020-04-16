/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+js_foundation
 * @format
 */

'use strict';

const generate = require('@babel/generator').default;
const {transformSync} = require('@babel/core');

opaque type Code = string;
opaque type Plugin = () => {};
opaque type Options = {};

function transform(
  code: Code,
  plugins: $ReadOnlyArray<Plugin>,
  options: Options,
) {
  return generate(
    transformSync(code, {
      ast: true,
      babelrc: false,
      code: false,
      compact: true,
      configFile: false,
      plugins: plugins.length
        ? plugins.map(plugin => [plugin, options])
        : [() => ({visitor: {}})],
      sourceType: 'module',
    }).ast,
  ).code;
}

exports.compare = function(
  plugins: $ReadOnlyArray<Plugin>,
  code: Code,
  expected: Code,
  options: Options = {},
) {
  expect(transform(code, plugins, options)).toBe(transform(expected, [], {}));
};
