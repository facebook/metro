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

const createModuleIdFactory = require('../../../lib/createModuleIdFactory');
const path = require('path');
const plainJSBundle = require('../plainJSBundle');

const polyfill = {
  output: [
    {
      type: 'js/script',
      data: {code: '__d(function() {/* code for polyfill */});'},
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
      data: {code: '__d(function() {/* code for foo */});', map: []},
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
      data: {code: '__d(function() {/* code for bar */});', map: []},
    },
  ],
  getSource: () => Buffer.from('bar-source'),
};

const getRunModuleStatement = moduleId =>
  `require(${JSON.stringify(moduleId)});`;

it('should serialize a very simple bundle', () => {
  expect(
    plainJSBundle(
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
  ).toEqual(
    [
      '__d(function() {/* code for polyfill */});',
      '__d(function() {/* code for foo */},"foo",["bar"],"foo");',
      '__d(function() {/* code for bar */},"bar",[],"bar");',
      'require("foo");',
      '//# sourceMappingURL=http://localhost/bundle.map',
    ].join('\n'),
  );
});

it('should add runBeforeMainModule statements if found in the graph', () => {
  expect(
    plainJSBundle(
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
    ),
  ).toEqual(
    [
      '__d(function() {/* code for polyfill */});',
      '__d(function() {/* code for foo */},"foo",["bar"],"foo");',
      '__d(function() {/* code for bar */},"bar",[],"bar");',
      'require("bar");',
      'require("foo");',
      '//# sourceMappingURL=http://localhost/bundle.map',
    ].join('\n'),
  );
});

it('should handle numeric module ids', () => {
  expect(
    plainJSBundle(
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
    ),
  ).toEqual(
    [
      '__d(function() {/* code for polyfill */});',
      '__d(function() {/* code for foo */},0,[1],"foo");',
      '__d(function() {/* code for bar */},1,[],"bar");',
      'require(1);',
      'require(0);',
      '//# sourceMappingURL=http://localhost/bundle.map',
    ].join('\n'),
  );
});

it('outputs custom runModule statements', () => {
  expect(
    plainJSBundle(
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
    ),
  ).toEqual(
    [
      '__d(function() {/* code for polyfill */});',
      '__d(function() {/* code for foo */},"foo",["bar"],"foo");',
      '__d(function() {/* code for bar */},"bar",[],"bar");',
      'export default require("bar").default;',
      'export default require("foo").default;',
    ].join('\n'),
  );
});

it('should add an inline source map to a very simple bundle', () => {
  const bundle = plainJSBundle(
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
  expect(bundle.slice(0, bundle.lastIndexOf('base64'))).toEqual(
    [
      '__d(function() {/* code for polyfill */});',
      '__d(function() {/* code for foo */},"foo",["bar"],"foo");',
      '__d(function() {/* code for bar */},"bar",[],"bar");',
      'require("foo");',
      '//# sourceMappingURL=data:application/json;charset=utf-8;',
    ].join('\n'),
  );
  expect(
    JSON.parse(
      Buffer.from(
        bundle.slice(bundle.lastIndexOf('base64') + 7),
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
