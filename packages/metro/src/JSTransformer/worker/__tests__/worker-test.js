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
  .mock('../../../lib/getMinifier', () => () => ({
    withSourceMap: (code, map) => ({
      code: code.replace('arbitrary(code)', 'minified(code)'),
      map,
    }),
  }))
  .mock('metro-minify-uglify');

const path = require('path');
const transformCode = require('..').transform;
const {InvalidRequireCallError} = require('..');

describe('code transformation worker:', () => {
  it('transforms a simple script', async () => {
    const {result} = await transformCode(
      'arbitrary/file.js',
      `local/file.js`,
      'someReallyArbitrary(code)',
      require.resolve('metro/src/transformer.js'),
      true,
      {
        dev: true,
        transform: {},
      },
      [],
      '',
      'minifyModulePath',
      'asyncRequire',
      'reject',
    );

    expect(result.output[0].type).toBe('js/script');
    expect(result.output[0].data.code).toBe(
      [
        '(function (global) {',
        '  someReallyArbitrary(code);',
        '})(this);',
      ].join('\n'),
    );
    expect(result.output[0].data.map).toHaveLength(3);
    expect(result.dependencies).toEqual([]);
  });

  it('transforms a simple module', async () => {
    const {result} = await transformCode(
      'arbitrary/file.js',
      `local/file.js`,
      'arbitrary(code)',
      require.resolve('metro/src/transformer.js'),
      false,
      {
        dev: true,
        transform: {},
      },
      [],
      '',
      'minifyModulePath',
      'asyncRequire',
      'reject',
    );

    expect(result.output[0].type).toBe('js/module');
    expect(result.output[0].data.code).toBe(
      [
        '__d(function (global, _$$_REQUIRE, module, exports, _dependencyMap) {',
        '  arbitrary(code);',
        '});',
      ].join('\n'),
    );
    expect(result.output[0].data.map).toHaveLength(3);
    expect(result.dependencies).toEqual([]);
  });

  it(`transforms a module with dependencies`, async () => {
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
      require.resolve('metro/src/transformer.js'),
      false,
      {
        dev: true,
        transform: {},
      },
      [],
      '',
      'minifyModulePath',
      'asyncRequire',
      'reject',
    );

    expect(result.output[0].type).toBe('js/module');
    expect(result.output[0].data.code).toBe(
      [
        '__d(function (global, _$$_REQUIRE, module, exports, _dependencyMap) {',
        "  'use strict';",
        '',
        '  var _c = babelHelpers.interopRequireDefault(_$$_REQUIRE(_dependencyMap[0], "./c"));',
        '',
        '  _$$_REQUIRE(_dependencyMap[1], "./a");',
        '',
        '  arbitrary(code);',
        '',
        '  var b = _$$_REQUIRE(_dependencyMap[2], "b");',
        '});',
      ].join('\n'),
    );
    expect(result.output[0].data.map).toHaveLength(14);
    expect(result.dependencies).toEqual([
      {isAsync: false, name: './c'},
      {isAsync: false, name: './a'},
      {isAsync: false, name: 'b'},
    ]);
  });

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
        'minifyModulePath',
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
      'minifyModulePath',
      'asyncRequire',
      'throwAtRuntime',
    );
  });

  it('minifies the code correctly', async () => {
    expect(
      (await transformCode(
        '/root/node_modules/bar/file.js',
        `node_modules/bar/file.js`,
        'arbitrary(code);',
        path.join(__dirname, '../../../transformer.js'),
        false,
        {
          dev: true,
          minify: true,
          transform: {},
          enableBabelRCLookup: false,
        },
        [],
        '',
        'minifyModulePath',
        'asyncRequire',
        'throwAtRuntime',
      )).result.output[0].data.code,
    ).toBe(
      [
        '__d(function (global, _$$_REQUIRE, module, exports, _dependencyMap) {',
        '  minified(code);',
        '});',
      ].join('\n'),
    );
  });

  it('minifies a JSON file', async () => {
    expect(
      (await transformCode(
        '/root/node_modules/bar/file.json',
        `node_modules/bar/file.js`,
        'arbitrary(code);',
        path.join(__dirname, '../../../transformer.js'),
        false,
        {
          dev: true,
          minify: true,
          transform: {},
          enableBabelRCLookup: false,
        },
        [],
        '',
        'minifyModulePath',
        'asyncRequire',
        'throwAtRuntime',
      )).result.output[0].data.code,
    ).toBe(
      [
        '__d(function(global, require, module, exports) {',
        '  module.exports = minified(code);;',
        '});',
      ].join('\n'),
    );
  });
});
