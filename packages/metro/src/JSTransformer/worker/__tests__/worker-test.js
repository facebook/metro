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

const transformerPath = require.resolve('metro/src/reactNativeTransformer');
const transformerContents = require('fs').readFileSync(transformerPath);

const babelRcPath = require.resolve('metro/rn-babelrc.json');
const babelRcContents = require('fs').readFileSync(babelRcPath);

let fs;
let mkdirp;
let transformCode;
let InvalidRequireCallError;

describe('code transformation worker:', () => {
  beforeEach(() => {
    jest.resetModules();

    jest.mock('fs', () => new (require('metro-memory-fs'))());

    fs = require('fs');
    mkdirp = require('mkdirp');
    ({transform: transformCode, InvalidRequireCallError} = require('..'));
    fs.reset();

    mkdirp.sync('/root/local');
    mkdirp.sync(path.dirname(transformerPath));
    fs.writeFileSync(transformerPath, transformerContents);
    fs.writeFileSync(babelRcPath, babelRcContents);
  });

  it('transforms a simple script', async () => {
    fs.writeFileSync('/root/local/file.js', 'someReallyArbitrary(code)');

    const {result} = await transformCode(
      '/root/local/file.js',
      'local/file.js',
      transformerPath,
      {
        dev: true,
        isScript: true,
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
    expect(result.output[0].data.map).toMatchSnapshot();
    expect(result.dependencies).toEqual([]);
  });

  it('transforms a simple module', async () => {
    fs.writeFileSync('/root/local/file.js', 'arbitrary(code)');

    const {result} = await transformCode(
      '/root/local/file.js',
      'local/file.js',
      transformerPath,
      {
        dev: true,
        isScript: false,
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
    expect(result.output[0].data.map).toMatchSnapshot();
    expect(result.dependencies).toEqual([]);
  });

  it('transforms a module with dependencies', async () => {
    fs.writeFileSync(
      '/root/local/file.js',
      [
        "'use strict';",
        'require("./a");',
        'arbitrary(code);',
        'const b = require("b");',
        'import c from "./c";',
      ].join('\n'),
    );

    const {result} = await transformCode(
      '/root/local/file.js',
      'local/file.js',
      transformerPath,
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
    expect(result.output[0].data.map).toMatchSnapshot();
    expect(result.dependencies).toEqual([
      {data: {isAsync: false}, name: './c'},
      {data: {isAsync: false}, name: './a'},
      {data: {isAsync: false}, name: 'b'},
    ]);
  });

  it('reports filename when encountering unsupported dynamic dependency', async () => {
    fs.writeFileSync(
      '/root/local/file.js',
      [
        'require("./a");',
        'let a = arbitrary(code);',
        'const b = require(a);',
      ].join('\n'),
    );

    try {
      await transformCode(
        '/root/local/file.js',
        'local/file.js',
        transformerPath,
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
    mkdirp.sync('/root/node_modules/foo');
    fs.writeFileSync('/root/node_modules/foo/bar.js', 'require(foo.bar);');

    await transformCode(
      '/root/node_modules/foo/bar.js',
      'node_modules/foo/bar.js',
      transformerPath,
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
    fs.writeFileSync('/root/local/file.js', 'arbitrary(code);');

    expect(
      (await transformCode(
        '/root/local/file.js',
        'local/file.js',
        transformerPath,
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
      ['__d(function (g, r, m, e, d) {', '  minified(code);', '});'].join('\n'),
    );
  });

  it('minifies a JSON file', async () => {
    fs.writeFileSync('/root/local/file.json', 'arbitrary(code);');

    expect(
      (await transformCode(
        '/root/local/file.json',
        'local/file.json',
        transformerPath,
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
