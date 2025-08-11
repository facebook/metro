/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

'use strict';

const rule = require('../no-commonjs-require');
const ESLintTester = require('eslint').RuleTester;

ESLintTester.setDefaultConfig({
  parser: require.resolve('hermes-eslint'),
  parserOptions: {
    ecmaVersion: 6,
    sourceType: 'module',
  },
});

const eslintTester = new ESLintTester();

eslintTester.run('no-commonjs-require', rule, {
  valid: [
    'require(someVariable);',
    'const foo = () => { let exports = {}; exports.foo = 42; return exports; };',
  ],
  invalid: [
    {
      code: 'require("foo");',
      output: 'import "foo";',
    },
    {
      code: 'const Foo = require("foo");',
      output: 'import Foo from "foo";',
    },
    {
      code: 'const {foo, bar} = require("foo");',
      output: 'import {foo, bar} from "foo";',
    },
    {
      code: 'const {foo: myFoo} = require("foo");',
      output: 'import {foo as myFoo} from "foo";',
    },
    {
      code: 'const debug = require("debug")("args");',
      output: null,
    },
    {
      code: 'const {foo: {fooProp}} = require("foo");',
      output: null,
    },
    {
      code: 'const bar = require("foo").bar;',
      output: null,
    },
    {
      code: 'let foo = require("foo");',
      output: null,
    },
    {
      code: 'foo = require("foo");',
      output: null,
    },
    {
      code: '() => { const foo = require("foo"); return foo; };',
      output: null,
    },
  ].map(obj => ({
    ...obj,
    errors: [{messageId: 'COMMONJS_REQUIRE'}],
  })),
});
