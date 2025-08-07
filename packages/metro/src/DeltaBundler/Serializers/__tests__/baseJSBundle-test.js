/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

'use strict';

import type {Module, TransformInputOptions} from '../../types';

import CountingSet from '../../../lib/CountingSet';

const createModuleIdFactory = require('../../../lib/createModuleIdFactory');
const baseJSBundle = require('../baseJSBundle');
const path = require('path');

const {objectContaining} = expect;

const polyfill: Module<> = {
  path: '/polyfill',
  dependencies: new Map(),
  inverseDependencies: new CountingSet(),
  output: [
    {
      type: 'js/script',
      data: {code: '__d(function() {/* code for polyfill */});', lineCount: 1},
    },
  ],
  getSource: () => Buffer.from('polyfill-source'),
};

const fooModule: Module<> = {
  path: '/root/foo',
  dependencies: new Map([
    [
      './bar',
      {
        absolutePath: '/root/bar',
        data: {
          data: {asyncType: null, isESMImport: false, locs: [], key: './bar'},
          name: './bar',
        },
      },
    ],
  ]),
  inverseDependencies: new CountingSet(),
  output: [
    {
      type: 'js/module',
      data: {
        code: '__d(function() {/* code for foo */});',
        map: [],
        lineCount: 1,
      },
    },
  ],
  getSource: () => Buffer.from('foo-source'),
};

const barModule: Module<> = {
  path: '/root/bar',
  dependencies: new Map(),
  inverseDependencies: new CountingSet(['/root/foo']),
  output: [
    {
      type: 'js/module',
      data: {
        code: '__d(function() {/* code for bar */});',
        map: [],
        lineCount: 1,
      },
    },
  ],
  getSource: () => Buffer.from('bar-source'),
};

const nonAsciiModule: Module<> = {
  path: '/root/%30.бундл.Øಚ😁AA',
  dependencies: new Map(),
  inverseDependencies: new CountingSet(),
  output: [
    {
      type: 'js/module',
      data: {
        code: '__d(function() {/* code for ascii file with non ascii characters: %30.бундл.Øಚ😁AA */});',
        map: [],
        lineCount: 1,
      },
    },
  ],
  getSource: () => Buffer.from('bar-source'),
};

const getRunModuleStatement = (moduleId: number | string) =>
  `require(${JSON.stringify(moduleId)});`;

const transformOptions: TransformInputOptions = {
  customTransformOptions: {},
  dev: true,
  hot: true,
  minify: true,
  platform: 'web',
  type: 'module',
  unstable_transformProfile: 'default',
};

test('should generate a very simple bundle', () => {
  expect(
    baseJSBundle(
      '/root/foo',
      [polyfill],
      {
        dependencies: new Map([
          ['/root/foo', fooModule],
          ['/root/bar', barModule],
        ]),
        entryPoints: new Set(['/root/foo']),
        transformOptions,
      },
      {
        asyncRequireModulePath: '',
        // $FlowFixMe[incompatible-call] createModuleId assumes numeric IDs - is this too strict?
        createModuleId: filePath => path.basename(filePath),
        dev: true,
        getRunModuleStatement,
        includeAsyncPaths: false,
        inlineSourceMap: false,
        modulesOnly: false,
        processModuleFilter: () => true,
        projectRoot: '/root',
        runBeforeMainModule: [],
        runModule: true,
        serverRoot: '/root',
        shouldAddToIgnoreList: () => false,
        sourceMapUrl: 'http://localhost/bundle.map',
        sourceUrl: null,
        getSourceUrl: null,
      },
    ),
  ).toMatchInlineSnapshot(`
    Object {
      "modules": Array [
        Array [
          "foo",
          "__d(function() {/* code for foo */},\\"foo\\",[\\"bar\\"],\\"foo\\");",
        ],
        Array [
          "bar",
          "__d(function() {/* code for bar */},\\"bar\\",[],\\"bar\\");",
        ],
      ],
      "post": "require(\\"foo\\");
    //# sourceMappingURL=http://localhost/bundle.map",
      "pre": "__d(function() {/* code for polyfill */});",
    }
  `);
});

test('should generate a bundle with correct ascii characters parsing', () => {
  expect(
    baseJSBundle(
      '/root/',
      [polyfill],
      {
        dependencies: new Map([['/root/%30.бундл.Øಚ😁AA', nonAsciiModule]]),
        entryPoints: new Set(['/root/%30.бундл.Øಚ😁AA']),
        transformOptions,
      },
      {
        asyncRequireModulePath: '',
        // $FlowFixMe[incompatible-call] createModuleId assumes numeric IDs - is this too strict?
        createModuleId: filePath => path.basename(filePath),
        dev: true,
        getRunModuleStatement,
        includeAsyncPaths: false,
        inlineSourceMap: false,
        modulesOnly: false,
        processModuleFilter: () => true,
        projectRoot: '/root',
        runBeforeMainModule: [],
        runModule: true,
        serverRoot: '/root',
        shouldAddToIgnoreList: () => false,
        // expecting to receive these as already encoded URIs
        sourceMapUrl: encodeURI('http://localhost/bundle.%30.бундл.Øಚ😁AA.map'),
        sourceUrl: encodeURI('http://localhost/bundle.%30.бундл.Øಚ😁AA.js'),
        getSourceUrl: null,
      },
    ),
  ).toMatchInlineSnapshot(`
    Object {
      "modules": Array [
        Array [
          "%30.бундл.Øಚ😁AA",
          "__d(function() {/* code for ascii file with non ascii characters: %30.бундл.Øಚ😁AA */},\\"%30.бундл.Øಚ😁AA\\",[],\\"%30.бундл.Øಚ😁AA\\");",
        ],
      ],
      "post": "//# sourceMappingURL=http://localhost/bundle.%2530.%D0%B1%D1%83%D0%BD%D0%B4%D0%BB.%C3%98%E0%B2%9A%F0%9F%98%81AA.map
    //# sourceURL=http://localhost/bundle.%2530.%D0%B1%D1%83%D0%BD%D0%B4%D0%BB.%C3%98%E0%B2%9A%F0%9F%98%81AA.js",
      "pre": "__d(function() {/* code for polyfill */});",
    }
  `);
});

test('should add runBeforeMainModule statements if found in the graph', () => {
  expect(
    baseJSBundle(
      '/root/foo',
      [polyfill],
      {
        dependencies: new Map([
          ['/root/foo', fooModule],
          ['/root/bar', barModule],
        ]),
        entryPoints: new Set(['/root/foo']),
        transformOptions,
      },
      {
        asyncRequireModulePath: '',
        // $FlowFixMe[incompatible-call] createModuleId assumes numeric IDs - is this too strict?
        createModuleId: filePath => path.basename(filePath),
        dev: true,
        getRunModuleStatement,
        includeAsyncPaths: false,
        inlineSourceMap: false,
        modulesOnly: false,
        processModuleFilter: () => true,
        projectRoot: '/root',
        runBeforeMainModule: ['/root/bar', 'non-existant'],
        runModule: true,
        serverRoot: '/root',
        shouldAddToIgnoreList: () => false,
        sourceMapUrl: 'http://localhost/bundle.map',
        sourceUrl: null,
        getSourceUrl: null,
      },
    ).post,
  ).toMatchInlineSnapshot(`
    "require(\\"bar\\");
    require(\\"foo\\");
    //# sourceMappingURL=http://localhost/bundle.map"
  `);
});

test('should handle numeric module ids', () => {
  expect(
    baseJSBundle(
      '/root/foo',
      [polyfill],
      {
        dependencies: new Map([
          ['/root/foo', fooModule],
          ['/root/bar', barModule],
        ]),
        entryPoints: new Set(['/root/foo']),
        transformOptions,
      },
      {
        asyncRequireModulePath: '',
        createModuleId: createModuleIdFactory(),
        dev: true,
        getRunModuleStatement,
        includeAsyncPaths: false,
        inlineSourceMap: false,
        modulesOnly: false,
        processModuleFilter: () => true,
        projectRoot: '/root',
        runBeforeMainModule: ['/root/bar', 'non-existant'],
        runModule: true,
        serverRoot: '/root',
        shouldAddToIgnoreList: () => false,
        sourceMapUrl: 'http://localhost/bundle.map',
        sourceUrl: null,
        getSourceUrl: null,
      },
    ).modules,
  ).toMatchInlineSnapshot(`
    Array [
      Array [
        0,
        "__d(function() {/* code for foo */},0,[1],\\"foo\\");",
      ],
      Array [
        1,
        "__d(function() {/* code for bar */},1,[],\\"bar\\");",
      ],
    ]
  `);
});

test('outputs custom runModule statements', () => {
  expect(
    baseJSBundle(
      '/root/foo',
      [polyfill],
      {
        dependencies: new Map([
          ['/root/foo', fooModule],
          ['/root/bar', barModule],
        ]),
        entryPoints: new Set(['/root/foo']),
        transformOptions,
      },
      {
        asyncRequireModulePath: '',
        // $FlowFixMe[incompatible-call] createModuleId assumes numeric IDs - is this too strict?
        createModuleId: filePath => path.basename(filePath),
        dev: true,
        getRunModuleStatement: moduleId =>
          `export default require(${JSON.stringify(moduleId)}).default;`,
        includeAsyncPaths: false,
        inlineSourceMap: false,
        modulesOnly: false,
        processModuleFilter: () => true,
        projectRoot: '/root',
        runBeforeMainModule: ['/root/bar'],
        runModule: true,
        serverRoot: '/root',
        shouldAddToIgnoreList: () => false,
        sourceMapUrl: null,
        sourceUrl: null,
        getSourceUrl: null,
      },
    ).post,
  ).toMatchInlineSnapshot(`
    "export default require(\\"bar\\").default;
    export default require(\\"foo\\").default;"
  `);
});

test('should add an inline source map to a very simple bundle', () => {
  const bundle = baseJSBundle(
    '/root/foo',
    [polyfill],
    {
      dependencies: new Map([
        ['/root/foo', fooModule],
        ['/root/bar', barModule],
      ]),
      entryPoints: new Set(['/root/foo']),
      transformOptions,
    },
    {
      asyncRequireModulePath: '',
      // $FlowFixMe[incompatible-call] createModuleId assumes numeric IDs - is this too strict?
      createModuleId: filePath => path.basename(filePath),
      dev: true,
      getRunModuleStatement,
      includeAsyncPaths: false,
      inlineSourceMap: true,
      modulesOnly: false,
      processModuleFilter: () => true,
      projectRoot: '/root',
      runBeforeMainModule: [],
      runModule: true,
      serverRoot: '/root',
      shouldAddToIgnoreList: () => false,
      sourceMapUrl: null,
      sourceUrl: null,
      getSourceUrl: null,
    },
  );
  expect(bundle.post.slice(0, bundle.post.lastIndexOf('base64'))).toEqual(
    'require("foo");\n//# sourceMappingURL=data:application/json;charset=utf-8;',
  );
  expect(
    JSON.parse(
      Buffer.from(
        bundle.post.slice(bundle.post.lastIndexOf('base64') + 7),
        'base64',
      ).toString(),
    ),
  ).toEqual({
    mappings: '',
    names: [],
    sources: ['/root/foo', '/root/bar'],
    sourcesContent: ['foo-source', 'bar-source'],
    version: 3,
  });
});

test('emits x_google_ignoreList based on shouldAddToIgnoreList', () => {
  const bundle = baseJSBundle(
    '/root/foo',
    [polyfill],
    {
      dependencies: new Map([
        ['/root/foo', fooModule],
        ['/root/bar', barModule],
      ]),
      entryPoints: new Set(['/root/foo']),
      transformOptions,
    },
    {
      asyncRequireModulePath: '',
      // $FlowFixMe[incompatible-call] createModuleId assumes numeric IDs - is this too strict?
      createModuleId: filePath => path.basename(filePath),
      dev: true,
      getRunModuleStatement,
      includeAsyncPaths: false,
      inlineSourceMap: true,
      modulesOnly: false,
      processModuleFilter: () => true,
      projectRoot: '/root',
      runBeforeMainModule: [],
      runModule: true,
      serverRoot: '/root',
      shouldAddToIgnoreList: () => true,
      sourceMapUrl: null,
      sourceUrl: null,
      getSourceUrl: null,
    },
  );
  expect(bundle.post.slice(0, bundle.post.lastIndexOf('base64'))).toEqual(
    'require("foo");\n//# sourceMappingURL=data:application/json;charset=utf-8;',
  );
  expect(
    JSON.parse(
      Buffer.from(
        bundle.post.slice(bundle.post.lastIndexOf('base64') + 7),
        'base64',
      ).toString(),
    ),
  ).toEqual(
    objectContaining({
      sources: ['/root/foo', '/root/bar'],
      x_google_ignoreList: [0, 1],
    }),
  );
});

test('does not add polyfills when `modulesOnly` is used', () => {
  expect(
    baseJSBundle(
      '/root/foo',
      [polyfill],
      {
        dependencies: new Map([
          ['/root/foo', fooModule],
          ['/root/bar', barModule],
        ]),
        entryPoints: new Set(['/root/foo']),
        transformOptions,
      },
      {
        asyncRequireModulePath: '',
        // $FlowFixMe[incompatible-call] createModuleId assumes numeric IDs - is this too strict?
        createModuleId: filePath => path.basename(filePath),
        dev: true,
        getRunModuleStatement,
        includeAsyncPaths: false,
        inlineSourceMap: false,
        modulesOnly: true,
        processModuleFilter: () => true,
        projectRoot: '/root',
        runBeforeMainModule: [],
        runModule: true,
        serverRoot: '/root',
        shouldAddToIgnoreList: () => false,
        sourceMapUrl: 'http://localhost/bundle.map',
        sourceUrl: null,
        getSourceUrl: null,
      },
    ),
  ).toMatchInlineSnapshot(`
    Object {
      "modules": Array [
        Array [
          "foo",
          "__d(function() {/* code for foo */},\\"foo\\",[\\"bar\\"],\\"foo\\");",
        ],
        Array [
          "bar",
          "__d(function() {/* code for bar */},\\"bar\\",[],\\"bar\\");",
        ],
      ],
      "post": "require(\\"foo\\");
    //# sourceMappingURL=http://localhost/bundle.map",
      "pre": "",
    }
  `);
});
