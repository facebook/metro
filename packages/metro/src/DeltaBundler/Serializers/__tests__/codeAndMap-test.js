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
const path = require('path');
const codeAndMap = require('../codeAndMap');

const polyfill = {
  path: '/root/pre.js',
  getSource: () => 'source pre',
  output: [
    {
      type: 'js/script',
      data: {
        code: '__d(function() {/* code for polyfill */});',
        map: [],
      },
    },
  ],
};

const fooModule = {
  path: '/root/foo',
  getSource: () => 'source foo',
  dependencies: new Map([['./bar', {absolutePath: '/root/bar', data: {}}]]),
  output: [
    {
      type: 'js/module',
      data: {
        code: '__d(function() {/* code for foo */});',
        map: [],
      },
    },
  ],
};

const barModule = {
  path: '/root/bar',
  getSource: () => 'source bar',
  dependencies: new Map(),
  output: [
    {
      type: 'js/module',
      data: {
        code: '__d(function() {/* code for bar */});',
        map: [],
      },
    },
  ],
};

const getRunModuleStatement = moduleId =>
  `require(${JSON.stringify(moduleId)});`;

describe('codeAndMap', () => {
  let postProcessBundleSourcemap;

  beforeEach(() => {
    postProcessBundleSourcemap = jest.fn().mockImplementation(val => val);
  });

  it('should serialize a very simple bundle', () => {
    const {code, map} = codeAndMap(
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
        postProcessBundleSourcemap,
        createModuleId: filePath => path.basename(filePath),
        dev: true,
        getRunModuleStatement,
        projectRoot: '/root',
        runBeforeMainModule: [],
        runModule: true,
        sourceMapUrl: 'http://localhost/bundle.map',
        excludeSource: false,
      },
    );
    expect(postProcessBundleSourcemap).toHaveBeenCalled();
    expect(code).toEqual(
      [
        '__d(function() {/* code for polyfill */});',
        '__d(function() {/* code for foo */},"foo",["bar"],"foo");',
        '__d(function() {/* code for bar */},"bar",[],"bar");',
        'require("foo");',
        '//# sourceMappingURL=http://localhost/bundle.map',
      ].join('\n'),
    );

    expect(JSON.parse(map)).toEqual({
      version: 3,
      sources: ['/root/pre.js', '/root/foo', '/root/bar'],
      sourcesContent: ['source pre', 'source foo', 'source bar'],
      names: [],
      mappings: '',
    });
  });

  it('respects postProcessBundleSourcemap results', () => {
    postProcessBundleSourcemap = jest
      .fn()
      .mockImplementation(() => ({code: 'code', map: 'map'}));

    const {code, map} = codeAndMap(
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
        postProcessBundleSourcemap,
        createModuleId: filePath => path.basename(filePath),
        dev: true,
        getRunModuleStatement,
        projectRoot: '/root',
        runBeforeMainModule: [],
        runModule: true,
        sourceMapUrl: 'http://localhost/bundle.map',
        excludeSource: false,
      },
    );
    expect(postProcessBundleSourcemap).toHaveBeenCalled();
    expect(code).toEqual('code');
    expect(map).toEqual('map');
  });

  it('should add runBeforeMainModule statements if found in the graph', () => {
    expect(
      codeAndMap(
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
          postProcessBundleSourcemap,
          createModuleId: filePath => path.basename(filePath),
          dev: true,
          getRunModuleStatement,
          projectRoot: '/root',
          runBeforeMainModule: ['/root/bar', 'non-existant'],
          runModule: true,
          sourceMapUrl: 'http://localhost/bundle.map',
          excludeSource: true,
        },
      ).code,
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
      codeAndMap(
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
          postProcessBundleSourcemap,
          createModuleId: createModuleIdFactory(),
          dev: true,
          getRunModuleStatement,
          projectRoot: '/root',
          runBeforeMainModule: ['/root/bar', 'non-existant'],
          runModule: true,
          sourceMapUrl: 'http://localhost/bundle.map',
          excludeSource: true,
        },
      ).code,
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
      codeAndMap(
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
          postProcessBundleSourcemap,
          createModuleId: filePath => path.basename(filePath),
          dev: true,
          getRunModuleStatement: moduleId =>
            `export default require(${JSON.stringify(moduleId)}).default;`,
          projectRoot: '/root',
          runBeforeMainModule: ['/root/bar'],
          runModule: true,
          excludeSource: true,
        },
      ).code,
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
});
