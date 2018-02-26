/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */
'use strict';

jest
  .mock('../constant-folding-plugin')
  .mock('../inline-plugin')
  .mock('metro-minify-uglify');

const path = require('path');
const transformCode = require('..').transform;
const {InvalidRequireCallError} = require('..');
const {version: BABEL_VERSION} = require('../../../babel-bridge');

describe('code transformation worker:', () => {
  it('transforms a simple script', async () => {
    const {result} = await transformCode(
      'arbitrary/file.js',
      `local/file.js`,
      'someReallyArbitrary(code)',
      path.join(__dirname, '../../../transformer.js'),
      true,
      {
        dev: true,
        transform: {},
      },
      [],
      '',
      'asyncRequire',
      'reject',
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
      'arbitrary/file.js',
      `local/file.js`,
      'arbitrary(code)',
      path.join(__dirname, '../../../transformer.js'),
      false,
      {
        dev: true,
        transform: {},
      },
      [],
      '',
      'asyncRequire',
      'reject',
    );

    expect(result.code).toBe(
      [
        '__d(function (global, _require, module, exports, _dependencyMap) {',
        '  arbitrary(code);',
        '});',
      ].join('\n'),
    );
    expect(result.map).toHaveLength(3);
    expect(result.dependencies).toEqual([]);
  });

  if (BABEL_VERSION === 7) {
    it(`transforms a module with dependencies (v${BABEL_VERSION})`, async () => {
      const {result} = await transformCode(
        'arbitrary/file.js',
        `local/file.js`,
        [
          "'use strict';",
          'require("./a");',
          'arbitrary(code);',
          'const b = require("b");',
          'import c from "./c";',
        ].join('\n'),
        path.join(__dirname, '../../../transformer.js'),
        false,
        {
          dev: true,
          transform: {},
        },
        [],
        '',
        'asyncRequire',
        'reject',
      );

      expect(BABEL_VERSION).toBe(7);
      expect(result.code).toBe(
        [
          '__d(function (global, _require, module, exports, _dependencyMap) {',
          "  'use strict';",
          '',
          '  var _c = babelHelpers.interopRequireDefault(_require(_dependencyMap[0], "./c"));',
          '',
          '  _require(_dependencyMap[1], "./a");',
          '',
          '  arbitrary(code);',
          '',
          '  var b = _require(_dependencyMap[2], "b");',
          '});',
        ].join('\n'),
      );
      expect(result.map).toHaveLength(14);
      expect(result.dependencies).toEqual(['./c', './a', 'b']);
    });
  } else {
    it(`transforms a module with dependencies (v${BABEL_VERSION})`, async () => {
      const {result} = await transformCode(
        'arbitrary/file.js',
        `local/file.js`,
        [
          'require("./a");',
          'arbitrary(code);',
          'const b = require("b");',
          'import c from "./c";',
        ].join('\n'),
        path.join(__dirname, '../../../transformer.js'),
        false,
        {
          dev: true,
          transform: {},
        },
        [],
        '',
        'asyncRequire',
        'reject',
      );

      expect(BABEL_VERSION).toBe(6);
      expect(result.code).toBe(
        [
          '__d(function (global, _require, module, exports, _dependencyMap) {',
          '  var _c = _require(_dependencyMap[0], "./c");',
          '',
          '  var _c2 = babelHelpers.interopRequireDefault(_c);',
          '',
          '  _require(_dependencyMap[1], "./a");',
          '',
          '  arbitrary(code);',
          '',
          '  var b = _require(_dependencyMap[2], "b");',
          '});',
        ].join('\n'),
      );
      expect(result.map).toHaveLength(13);
      expect(result.dependencies).toEqual(['./c', './a', 'b']);
    });
  }

  it('reports filename when encountering unsupported dynamic dependency', async () => {
    try {
      await transformCode(
        'arbitrary/file.js',
        `local/file.js`,
        [
          'require("./a");',
          'let a = arbitrary(code);',
          'const b = require(a);',
        ].join('\n'),
        path.join(__dirname, '../../../transformer.js'),
        false,
        {
          dev: true,
          transform: {},
        },
        [],
        '',
        'asyncRequire',
        'reject',
      );
      throw new Error('should not reach this');
    } catch (error) {
      if (!(error instanceof InvalidRequireCallError)) {
        throw error;
      }
      expect(error.message).toMatchSnapshot();
    }
  });

  it('supports dynamic dependencies from within `node_modules`', async () => {
    await transformCode(
      '/root/node_modules/bar/file.js',
      `node_modules/bar/file.js`,
      'require(global.something);\n',
      path.join(__dirname, '../../../transformer.js'),
      false,
      {
        dev: true,
        transform: {},
        enableBabelRCLookup: false,
      },
      [],
      '',
      'asyncRequire',
      'throwAtRuntime',
    );
  });
});
