/**
 * Copyright (c) Facebook, Inc. and its affiliates.
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

const babelTransformerPath = require.resolve(
  'metro/src/reactNativeTransformer',
);
const transformerContents = require('fs').readFileSync(babelTransformerPath);

let fs;
let mkdirp;
let transform;

describe('code transformation worker:', () => {
  beforeEach(() => {
    jest.resetModules();

    jest.mock('fs', () => new (require('metro-memory-fs'))());

    fs = require('fs');
    mkdirp = require('mkdirp');
    ({transform: transform} = require('../../worker'));
    fs.reset();

    mkdirp.sync('/root/local');
    mkdirp.sync(path.dirname(babelTransformerPath));
    fs.writeFileSync(babelTransformerPath, transformerContents);
  });

  it('transforms a simple script', async () => {
    const result = await transform(
      '/root/local/file.js',
      'local/file.js',
      'someReallyArbitrary(code)',
      {
        assetExts: [],
        assetPlugins: [],
        assetRegistryPath: '',
        asyncRequireModulePath: 'asyncRequire',
        type: 'script',
        minifierPath: 'minifyModulePath',
        babelTransformerPath,
        transformOptions: {dev: true},
        dynamicDepsInPackages: 'reject',
        optimizationSizeLimit: 100000,
      },
    );

    expect(result.output[0].type).toBe('js/script');
    expect(result.output[0].data.code).toBe(
      [
        '(function (global) {',
        '  someReallyArbitrary(code);',
        "})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);",
      ].join('\n'),
    );
    expect(result.output[0].data.map).toMatchSnapshot();
    expect(result.dependencies).toEqual([]);
  });

  it('transforms a simple module', async () => {
    const result = await transform(
      '/root/local/file.js',
      'local/file.js',
      'arbitrary(code)',
      {
        assetExts: [],
        assetPlugins: [],
        assetRegistryPath: '',
        asyncRequireModulePath: 'asyncRequire',
        type: 'module',
        minifierPath: 'minifyModulePath',
        babelTransformerPath,
        transformOptions: {dev: true},
        dynamicDepsInPackages: 'reject',
        optimizationSizeLimit: 100000,
      },
    );

    expect(result.output[0].type).toBe('js/module');
    expect(result.output[0].data.code).toBe(
      [
        '__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {',
        '  arbitrary(code);',
        '});',
      ].join('\n'),
    );
    expect(result.output[0].data.map).toMatchSnapshot();
    expect(result.dependencies).toEqual([]);
  });

  it('transforms a module with dependencies', async () => {
    const contents = [
      "'use strict';",
      'require("./a");',
      'arbitrary(code);',
      'const b = require("b");',
      'import c from "./c";',
    ].join('\n');

    const result = await transform(
      '/root/local/file.js',
      'local/file.js',
      contents,
      {
        assetExts: [],
        assetPlugins: [],
        assetRegistryPath: '',
        asyncRequireModulePath: 'asyncRequire',
        isScript: false,
        minifierPath: 'minifyModulePath',
        babelTransformerPath,
        transformOptions: {dev: true},
        dynamicDepsInPackages: 'reject',
        optimizationSizeLimit: 100000,
      },
    );

    expect(result.output[0].type).toBe('js/module');
    expect(result.output[0].data.code).toBe(
      [
        '__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {',
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

  it('transforms import/export syntax when experimental flag is on', async () => {
    const contents = ['import c from "./c";'].join('\n');

    const result = await transform(
      '/root/local/file.js',
      'local/file.js',
      contents,
      {
        assetExts: [],
        assetPlugins: [],
        assetRegistryPath: '',
        asyncRequireModulePath: 'asyncRequire',
        isScript: false,
        minifierPath: 'minifyModulePath',
        babelTransformerPath,
        transformOptions: {dev: true, experimentalImportSupport: true},
        dynamicDepsInPackages: 'reject',
        optimizationSizeLimit: 100000,
      },
    );

    expect(result.output[0].type).toBe('js/module');
    expect(result.output[0].data.code).toBe(
      [
        '__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {',
        '  "use strict";',
        '',
        '  var c = _$$_IMPORT_DEFAULT(_dependencyMap[0], "./c");',
        '});',
      ].join('\n'),
    );
    expect(result.output[0].data.map).toMatchSnapshot();
    expect(result.dependencies).toEqual([
      {
        data: {
          isAsync: false,
        },
        name: './c',
      },
    ]);
  });

  it('reports filename when encountering unsupported dynamic dependency', async () => {
    const contents = [
      'require("./a");',
      'let a = arbitrary(code);',
      'const b = require(a);',
    ].join('\n');

    try {
      await transform('/root/local/file.js', 'local/file.js', contents, {
        assetExts: [],
        assetPlugins: [],
        assetRegistryPath: '',
        asyncRequireModulePath: 'asyncRequire',
        isScript: false,
        minifierPath: 'minifyModulePath',
        babelTransformerPath,
        transformOptions: {dev: true},
        dynamicDepsInPackages: 'reject',
        optimizationSizeLimit: 100000,
      });
      throw new Error('should not reach this');
    } catch (error) {
      expect(error.message).toMatchSnapshot();
    }
  });

  it('supports dynamic dependencies from within `node_modules`', async () => {
    await transform(
      '/root/node_modules/foo/bar.js',
      'node_modules/foo/bar.js',
      'require(foo.bar);',
      {
        assetExts: [],
        assetPlugins: [],
        assetRegistryPath: '',
        asyncRequireModulePath: 'asyncRequire',
        isScript: false,
        minifierPath: 'minifyModulePath',
        babelTransformerPath,
        transformOptions: {dev: true},
        dynamicDepsInPackages: 'throwAtRuntime',
        optimizationSizeLimit: 100000,
      },
    );
  });

  it('minifies the code correctly', async () => {
    expect(
      (await transform(
        '/root/local/file.js',
        'local/file.js',
        'arbitrary(code);',
        {
          assetExts: [],
          assetPlugins: [],
          assetRegistryPath: '',
          asyncRequireModulePath: 'asyncRequire',
          isScript: false,
          minifierPath: 'minifyModulePath',
          babelTransformerPath,
          transformOptions: {dev: true, minify: true},
          dynamicDepsInPackages: 'throwAtRuntime',
          optimizationSizeLimit: 100000,
        },
      )).output[0].data.code,
    ).toBe(
      ['__d(function (g, r, i, a, m, e, d) {', '  minified(code);', '});'].join(
        '\n',
      ),
    );
  });

  it('minifies a JSON file', async () => {
    expect(
      (await transform(
        '/root/local/file.json',
        'local/file.json',
        'arbitrary(code);',
        {
          assetExts: [],
          assetPlugins: [],
          assetRegistryPath: '',
          asyncRequireModulePath: 'asyncRequire',
          isScript: false,
          minifierPath: 'minifyModulePath',
          babelTransformerPath,
          transformOptions: {dev: true, minify: true},
          dynamicDepsInPackages: 'throwAtRuntime',
          optimizationsizelimit: 100000,
        },
      )).output[0].data.code,
    ).toBe(
      [
        '__d(function(global, require, _aUnused, _bUnused, module, exports, _cUnused) {',
        '  module.exports = minified(code);;',
        '});',
      ].join('\n'),
    );
  });
});
