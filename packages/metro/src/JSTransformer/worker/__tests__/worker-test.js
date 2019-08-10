/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 */
'use strict';

jest
  .mock('../constant-folding-plugin')
  .mock('../../../lib/getMinifier', () => () => ({code, map}) => ({
    code: code.replace('arbitrary(code)', 'minified(code)'),
    map,
  }))
  .mock('metro-minify-uglify');

const path = require('path');

const babelTransformerPath = require.resolve(
  'metro-react-native-babel-transformer',
);
const transformerContents = require('fs').readFileSync(babelTransformerPath);

const HEADER_DEV =
  '__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {';
const HEADER_PROD = '__d(function (g, r, i, a, m, e, d) {';

let fs;
let mkdirp;
let Transformer;
let transformer;

const baseOptions = {
  assetExts: [],
  assetPlugins: [],
  assetRegistryPath: '',
  asyncRequireModulePath: 'asyncRequire',
  babelTransformerPath,
  dynamicDepsInPackages: 'reject',
  enableBabelRuntime: true,
  minifierConfig: {},
  minifierPath: 'minifyModulePath',
  optimizationSizeLimit: 100000,
};

describe('code transformation worker:', () => {
  beforeEach(() => {
    jest.resetModules();

    jest.mock('fs', () => new (require('metro-memory-fs'))());
    jest.mock('../inline-plugin', () => ({}));

    fs = require('fs');
    mkdirp = require('mkdirp');
    Transformer = require('../../worker');
    transformer = new Transformer('/root', baseOptions);
    fs.reset();

    mkdirp.sync('/root/local');
    mkdirp.sync(path.dirname(babelTransformerPath));
    fs.writeFileSync(babelTransformerPath, transformerContents);
  });

  it('transforms a simple script', async () => {
    const result = await transformer.transform(
      'local/file.js',
      'someReallyArbitrary(code)',
      {
        dev: true,
        type: 'script',
      },
    );

    expect(result.output[0].type).toBe('js/script');
    expect(result.output[0].data.code).toBe(
      [
        '(function (global) {',
        '  someReallyArbitrary(code);',
        "})(typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : this);",
      ].join('\n'),
    );
    expect(result.output[0].data.map).toMatchSnapshot();
    expect(result.output[0].data.functionMap).toMatchSnapshot();
    expect(result.dependencies).toEqual([]);
  });

  it('transforms a simple module', async () => {
    const result = await transformer.transform(
      'local/file.js',
      'arbitrary(code)',
      {
        dev: true,
        type: 'module',
      },
    );

    expect(result.output[0].type).toBe('js/module');
    expect(result.output[0].data.code).toBe(
      [HEADER_DEV, '  arbitrary(code);', '});'].join('\n'),
    );
    expect(result.output[0].data.map).toMatchSnapshot();
    expect(result.output[0].data.functionMap).toMatchSnapshot();
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

    const result = await transformer.transform('local/file.js', contents, {
      dev: true,
      type: 'module',
    });

    expect(result.output[0].type).toBe('js/module');
    expect(result.output[0].data.code).toBe(
      [
        HEADER_DEV,
        "  'use strict';",
        '',
        '  var _interopRequireDefault = _$$_REQUIRE(_dependencyMap[0], "@babel/runtime/helpers/interopRequireDefault");',
        '',
        '  var _c = _interopRequireDefault(_$$_REQUIRE(_dependencyMap[1], "./c"));',
        '',
        '  _$$_REQUIRE(_dependencyMap[2], "./a");',
        '',
        '  arbitrary(code);',
        '',
        '  var b = _$$_REQUIRE(_dependencyMap[3], "b");',
        '});',
      ].join('\n'),
    );
    expect(result.output[0].data.map).toMatchSnapshot();
    expect(result.output[0].data.functionMap).toMatchSnapshot();
    expect(result.dependencies).toEqual([
      {
        data: {isAsync: false},
        name: '@babel/runtime/helpers/interopRequireDefault',
      },
      {data: {isAsync: false}, name: './c'},
      {data: {isAsync: false}, name: './a'},
      {data: {isAsync: false}, name: 'b'},
    ]);
  });

  it('transforms an es module with regenerator', async () => {
    const result = await transformer.transform(
      'local/file.js',
      'export async function test() {}',
      {
        dev: true,
        type: 'module',
      },
    );

    expect(result.output[0].type).toBe('js/module');
    expect(result.output[0].data.code).toMatchSnapshot();
    expect(result.output[0].data.map).toHaveLength(13);
    expect(result.output[0].data.functionMap).toMatchSnapshot();
    expect(result.dependencies).toEqual([
      {
        data: {isAsync: false},
        name: '@babel/runtime/helpers/interopRequireDefault',
      },
      {
        data: {isAsync: false},
        name: '@babel/runtime/regenerator',
      },
    ]);
  });

  it('transforms import/export syntax when experimental flag is on', async () => {
    const contents = ['import c from "./c";'].join('\n');

    const result = await transformer.transform('local/file.js', contents, {
      dev: true,
      experimentalImportSupport: true,
      type: 'module',
    });

    expect(result.output[0].type).toBe('js/module');
    expect(result.output[0].data.code).toBe(
      [
        HEADER_DEV,
        '  "use strict";',
        '',
        '  var c = _$$_IMPORT_DEFAULT(_dependencyMap[0], "./c");',
        '});',
      ].join('\n'),
    );
    expect(result.output[0].data.map).toMatchSnapshot();
    expect(result.output[0].data.functionMap).toMatchSnapshot();
    expect(result.dependencies).toEqual([
      {
        data: {
          isAsync: false,
        },
        name: './c',
      },
    ]);
  });

  it('does not add "use strict" on non-modules', async () => {
    const result = await transformer.transform(
      'node_modules/local/file.js',
      'module.exports = {};',
      {
        dev: true,
        experimentalImportSupport: true,
        type: 'module',
      },
    );

    expect(result.output[0].type).toBe('js/module');
    expect(result.output[0].data.code).toBe(
      [HEADER_DEV, '  module.exports = {};', '});'].join('\n'),
    );
  });

  it('reports filename when encountering unsupported dynamic dependency', async () => {
    const contents = [
      'require("./a");',
      'let a = arbitrary(code);',
      'const b = require(a);',
    ].join('\n');

    try {
      await transformer.transform('local/file.js', contents, {
        dev: true,
        type: 'module',
      });
      throw new Error('should not reach this');
    } catch (error) {
      expect(error.message).toMatchSnapshot();
    }
  });

  it('supports dynamic dependencies from within `node_modules`', async () => {
    transformer = new Transformer('/root', {
      ...baseOptions,
      dynamicDepsInPackages: 'throwAtRuntime',
    });

    expect(
      (await transformer.transform(
        'node_modules/foo/bar.js',
        'require(foo.bar);',
        {
          dev: true,
          type: 'module',
        },
      )).output[0].data.code,
    ).toBe(
      [
        HEADER_DEV,
        '  (function (line) {',
        "    throw new Error('Dynamic require defined at line ' + line + '; not supported by Metro');",
        '  })(1);',
        '});',
      ].join('\n'),
    );
  });

  it('minifies the code correctly', async () => {
    expect(
      (await transformer.transform('local/file.js', 'arbitrary(code);', {
        dev: true,
        minify: true,
        type: 'module',
      })).output[0].data.code,
    ).toBe([HEADER_PROD, '  minified(code);', '});'].join('\n'));
  });

  it('minifies a JSON file', async () => {
    expect(
      (await transformer.transform('local/file.json', 'arbitrary(code);', {
        dev: true,
        minify: true,
        type: 'module',
      })).output[0].data.code,
    ).toBe(
      [
        '__d(function(global, require, _aUnused, _bUnused, module, exports, _cUnused) {',
        '  module.exports = minified(code);;',
        '});',
      ].join('\n'),
    );
  });
});
