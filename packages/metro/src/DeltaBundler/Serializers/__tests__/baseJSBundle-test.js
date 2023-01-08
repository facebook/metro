/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

const createModuleIdFactory = require('../../../lib/createModuleIdFactory');
const baseJSBundle = require('../baseJSBundle');
const path = require('path');

const polyfill = {
  output: [
    {
      type: 'js/script',
      data: {code: '__d(function() {/* code for polyfill */});', lineCount: 1},
    },
  ],
  getSource: () => Buffer.from('polyfill-source'),
};

const fooModule = {
  path: '/root/foo',
  dependencies: new Map([['./bar', {absolutePath: '/root/bar', data: {}}]]),
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

const barModule = {
  path: '/root/bar',
  dependencies: new Map(),
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

const getRunModuleStatement = moduleId =>
  `require(${JSON.stringify(moduleId)});`;

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
        entryPoints: ['foo'],
      },
      {
        processModuleFilter: () => true,
        createModuleId: filePath => path.basename(filePath),
        dev: true,
        getRunModuleStatement,
        projectRoot: '/root',
        runBeforeMainModule: [],
        runModule: true,
        sourceMapUrl: 'http://localhost/bundle.map',
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
        entryPoints: ['/root/foo'],
      },
      {
        processModuleFilter: () => true,
        createModuleId: filePath => path.basename(filePath),
        dev: true,
        getRunModuleStatement,
        projectRoot: '/root',
        runBeforeMainModule: ['/root/bar', 'non-existant'],
        runModule: true,
        sourceMapUrl: 'http://localhost/bundle.map',
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
        entryPoints: ['/root/foo'],
      },
      {
        processModuleFilter: () => true,
        createModuleId: createModuleIdFactory(),
        dev: true,
        getRunModuleStatement,
        projectRoot: '/root',
        runBeforeMainModule: ['/root/bar', 'non-existant'],
        runModule: true,
        sourceMapUrl: 'http://localhost/bundle.map',
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
        entryPoints: ['/root/foo'],
      },
      {
        processModuleFilter: () => true,
        createModuleId: filePath => path.basename(filePath),
        dev: true,
        getRunModuleStatement: moduleId =>
          `export default require(${JSON.stringify(moduleId)}).default;`,
        projectRoot: '/root',
        runBeforeMainModule: ['/root/bar'],
        runModule: true,
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
      entryPoints: ['foo'],
    },
    {
      processModuleFilter: () => true,
      createModuleId: filePath => path.basename(filePath),
      dev: true,
      getRunModuleStatement,
      projectRoot: '/root',
      runBeforeMainModule: [],
      runModule: true,
      inlineSourceMap: true,
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
        entryPoints: ['foo'],
      },
      {
        processModuleFilter: () => true,
        createModuleId: filePath => path.basename(filePath),
        dev: true,
        getRunModuleStatement,
        modulesOnly: true,
        projectRoot: '/root',
        runBeforeMainModule: [],
        runModule: true,
        sourceMapUrl: 'http://localhost/bundle.map',
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
