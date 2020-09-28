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
  .mock('../utils/getMinifier', () => () => ({code, map}) => ({
    code: code.replace('arbitrary(code)', 'minified(code)'),
    map,
  }))
  .mock('metro-transform-plugins', () => ({
    ...jest.requireActual('metro-transform-plugins'),
    inlinePlugin: () => ({}),
    constantFoldingPlugin: () => ({}),
  }))
  .mock('metro-minify-uglify');

const HermesCompiler = require('metro-hermes-compiler');

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

const baseOptions = {
  assetExts: [],
  assetPlugins: [],
  assetRegistryPath: '',
  asyncRequireModulePath: 'asyncRequire',
  babelTransformerPath,
  dynamicDepsInPackages: 'reject',
  enableBabelRuntime: true,
  globalPrefix: '',
  minifierConfig: {},
  minifierPath: 'minifyModulePath',
  optimizationSizeLimit: 100000,
};

beforeEach(() => {
  jest.resetModules();

  jest.mock('fs', () => new (require('metro-memory-fs'))());

  fs = require('fs');
  mkdirp = require('mkdirp');
  Transformer = require('../');
  fs.reset();

  mkdirp.sync('/root/local');
  mkdirp.sync(path.dirname(babelTransformerPath));
  fs.writeFileSync(babelTransformerPath, transformerContents);
});

it('transforms a simple script', async () => {
  const result = await Transformer.transform(
    baseOptions,
    '/root',
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
  const result = await Transformer.transform(
    baseOptions,
    '/root',
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

  const result = await Transformer.transform(
    baseOptions,
    '/root',
    'local/file.js',
    contents,
    {
      dev: true,
      type: 'module',
    },
  );

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
      data: expect.objectContaining({asyncType: null}),
      name: '@babel/runtime/helpers/interopRequireDefault',
    },
    {data: expect.objectContaining({asyncType: null}), name: './c'},
    {data: expect.objectContaining({asyncType: null}), name: './a'},
    {data: expect.objectContaining({asyncType: null}), name: 'b'},
  ]);
});

it('transforms an es module with regenerator', async () => {
  const result = await Transformer.transform(
    baseOptions,
    '/root',
    'local/file.js',
    'export async function test() {}',
    {
      dev: true,
      type: 'module',
    },
  );

  expect(result.output[0].type).toBe('js/module');
  const code = result.output[0].data.code.split('\n');
  // Ignore a small difference in regenerator output
  if (code[code.length - 3] === '    }, null, null, null, Promise);') {
    code[code.length - 3] = '    }, null, this);';
  }
  expect(code.join('\n')).toMatchSnapshot();
  expect(result.output[0].data.map).toHaveLength(13);
  expect(result.output[0].data.functionMap).toMatchSnapshot();
  expect(result.dependencies).toEqual([
    {
      data: expect.objectContaining({asyncType: null}),
      name: '@babel/runtime/helpers/interopRequireDefault',
    },
    {
      data: expect.objectContaining({asyncType: null}),
      name: '@babel/runtime/regenerator',
    },
  ]);
});

it('transforms import/export syntax when experimental flag is on', async () => {
  const contents = ['import c from "./c";'].join('\n');

  const result = await Transformer.transform(
    baseOptions,
    '/root',
    'local/file.js',
    contents,
    {
      dev: true,
      experimentalImportSupport: true,
      type: 'module',
    },
  );

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
      data: expect.objectContaining({
        asyncType: null,
      }),
      name: './c',
    },
  ]);
});

it('does not add "use strict" on non-modules', async () => {
  const result = await Transformer.transform(
    baseOptions,
    '/root',
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
    await Transformer.transform(
      baseOptions,
      '/root',
      'local/file.js',
      contents,
      {
        dev: true,
        type: 'module',
      },
    );
    throw new Error('should not reach this');
  } catch (error) {
    expect(error.message).toMatchSnapshot();
  }
});

it('supports dynamic dependencies from within `node_modules`', async () => {
  expect(
    (
      await Transformer.transform(
        {
          ...baseOptions,
          dynamicDepsInPackages: 'throwAtRuntime',
        },
        '/root',
        'node_modules/foo/bar.js',
        'require(foo.bar);',
        {
          dev: true,
          type: 'module',
        },
      )
    ).output[0].data.code,
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
    (
      await Transformer.transform(
        baseOptions,
        '/root',
        'local/file.js',
        'arbitrary(code);',
        {
          dev: true,
          minify: true,
          type: 'module',
        },
      )
    ).output[0].data.code,
  ).toBe([HEADER_PROD, '  minified(code);', '});'].join('\n'));
});

it('minifies a JSON file', async () => {
  expect(
    (
      await Transformer.transform(
        baseOptions,
        '/root',
        'local/file.json',
        'arbitrary(code);',
        {
          dev: true,
          minify: true,
          type: 'module',
        },
      )
    ).output[0].data.code,
  ).toBe(
    [
      '__d(function(global, require, _importDefaultUnused, _importAllUnused, module, exports, _dependencyMapUnused) {',
      '  module.exports = minified(code);;',
      '});',
    ].join('\n'),
  );
});

it('transforms a script to JS source and bytecode', async () => {
  const result = await Transformer.transform(
    baseOptions,
    '/root',
    'local/file.js',
    'someReallyArbitrary(code)',
    {
      dev: true,
      runtimeBytecodeVersion: 1,
      type: 'script',
    },
  );

  const jsOutput = result.output.find(output => output.type === 'js/script');
  const bytecodeOutput = result.output.find(
    output => output.type === 'bytecode/script',
  );

  expect(jsOutput.data.code).toBe(
    [
      '(function (global) {',
      '  someReallyArbitrary(code);',
      "})(typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : this);",
    ].join('\n'),
  );

  expect(() =>
    HermesCompiler.validateBytecodeModule(bytecodeOutput.data.bytecode, 0),
  ).not.toThrow();
});
