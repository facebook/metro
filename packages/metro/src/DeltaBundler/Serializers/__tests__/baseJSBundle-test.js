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

import type {Module, TransformInputOptions} from '../../types.flow';

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
        data: {data: {asyncType: null, locs: [], key: './bar'}, name: './bar'},
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

it('should generate a very simple bundle', () => {
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

it('should add runBeforeMainModule statements if found in the graph', () => {
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
      },
    ).post,
  ).toMatchInlineSnapshot(`
    "require(\\"bar\\");
    require(\\"foo\\");
    //# sourceMappingURL=http://localhost/bundle.map"
  `);
});

it('should handle numeric module ids', () => {
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

it('outputs custom runModule statements', () => {
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
      },
    ).post,
  ).toMatchInlineSnapshot(`
    "export default require(\\"bar\\").default;
    export default require(\\"foo\\").default;"
  `);
});

it('should add an inline source map to a very simple bundle', () => {
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

it('emits x_google_ignoreList based on shouldAddToIgnoreList', () => {
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

it('does not add polyfills when `modulesOnly` is used', () => {
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
