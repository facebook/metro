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

const createModuleIdFactory = require('../../../lib/createModuleIdFactory');
const plainJSBundle = require('../plainJSBundle');

const polyfill = {
  output: {
    type: 'script',
    code: '__d(function() {/* code for polyfill */});',
  },
};

const fooModule = {
  path: 'foo',
  dependencies: new Map([['./bar', {absolutePath: 'bar', data: {}}]]),
  output: {code: '__d(function() {/* code for foo */});'},
};

const barModule = {
  path: 'bar',
  dependencies: new Map(),
  output: {code: '__d(function() {/* code for bar */});'},
};

const getRunModuleStatement = moduleId =>
  `require(${JSON.stringify(moduleId)});`;

it('should serialize a very simple bundle', () => {
  expect(
    plainJSBundle(
      'foo',
      [polyfill],
      {
        dependencies: new Map([['foo', fooModule], ['bar', barModule]]),
        entryPoints: ['foo'],
      },
      {
        createModuleId: path => path,
        dev: true,
        getRunModuleStatement,
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
      'foo',
      [polyfill],
      {
        dependencies: new Map([['foo', fooModule], ['bar', barModule]]),
        entryPoints: ['foo'],
      },
      {
        createModuleId: path => path,
        dev: true,
        getRunModuleStatement,
        runBeforeMainModule: ['bar', 'non-existant'],
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
      'foo',
      [polyfill],
      {
        dependencies: new Map([['foo', fooModule], ['bar', barModule]]),
        entryPoints: ['foo'],
      },
      {
        createModuleId: createModuleIdFactory(),
        dev: true,
        getRunModuleStatement,
        runBeforeMainModule: ['bar', 'non-existant'],
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
      'foo',
      [polyfill],
      {
        dependencies: new Map([['foo', fooModule], ['bar', barModule]]),
        entryPoints: ['foo'],
      },
      {
        createModuleId: path => path,
        dev: true,
        getRunModuleStatement: moduleId =>
          `export default require(${JSON.stringify(moduleId)}).default;`,
        runBeforeMainModule: ['bar'],
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
