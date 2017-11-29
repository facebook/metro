/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails oncall+javascript_foundation
 * @format
 */
'use strict';

jest
  .mock('../constant-folding')
  .mock('../inline')
  .mock('../minify');

const path = require('path');
const transformCode = require('..').transform;

describe('code transformation worker:', () => {
  it('transforms a simple script', async () => {
    const {result} = await transformCode(
      path.join(__dirname, '../../../transformer.js'),
      'arbitrary/file.js',
      `local/file.js`,
      'someReallyArbitrary(code)',
      true,
      {
        dev: true,
        transform: {},
      },
    );

    expect(result.code).toBe(
      [
        '(function (global) {',
        '  someReallyArbitrary(code);',
        '})(this);',
      ].join('\n'),
    );
    expect(result.map).toHaveLength(3);
    expect(result.dependencies).toEqual([]);
  });

  it('transforms a simple module', async () => {
    const {result} = await transformCode(
      path.join(__dirname, '../../../transformer.js'),
      'arbitrary/file.js',
      `local/file.js`,
      'arbitrary(code)',
      false,
      {
        dev: true,
        transform: {},
      },
    );

    expect(result.code).toBe(
      [
        '__d(function (global, require, module, exports, _dependencyMap) {',
        '  arbitrary(code);',
        '});',
      ].join('\n'),
    );
    expect(result.map).toHaveLength(3);
    expect(result.dependencies).toEqual([]);
  });

  it('transforms a module with dependencies', async () => {
    const {result} = await transformCode(
      path.join(__dirname, '../../../transformer.js'),
      'arbitrary/file.js',
      `local/file.js`,
      [
        'require("./a");',
        'arbitrary(code);',
        'const b = require("b");',
        'import c from "./c";',
      ].join('\n'),
      false,
      {
        dev: true,
        transform: {},
      },
    );

    expect(result.code).toBe(
      [
        '__d(function (global, require, module, exports, _dependencyMap) {',
        '  var _c = require(_dependencyMap[0], "./c");',
        '',
        '  var _c2 = babelHelpers.interopRequireDefault(_c);',
        '',
        '  require(_dependencyMap[1], "./a");',
        '',
        '  arbitrary(code);',
        '',
        '  var b = require(_dependencyMap[2], "b");',
        '});',
      ].join('\n'),
    );
    expect(result.map).toHaveLength(13);
    expect(result.dependencies).toEqual(['./c', './a', 'b']);
  });
});
