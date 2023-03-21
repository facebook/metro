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

const baseBytecodeBundle = require('../baseBytecodeBundle');
const {compile, validateBytecodeModule} = require('metro-hermes-compiler');
const path = require('path');

const transformOptions: TransformInputOptions = {
  customTransformOptions: {},
  dev: true,
  hot: true,
  minify: true,
  platform: 'web',
  runtimeBytecodeVersion: 900,
  type: 'module',
  unstable_transformProfile: 'default',
};

const polyfillCode = '__d(function() {/* code for polyfill */});';
const polyfillBytecode = compile(polyfillCode, {
  sourceURL: 'polyfill-source',
}).bytecode;
const polyfill: Module<> = {
  path: '/polyfill',
  dependencies: new Map(),
  inverseDependencies: new CountingSet<string>(),
  output: [
    {
      type: 'js/script',
      data: {code: polyfillCode, lineCount: 1},
    },
    {
      type: 'bytecode/script',
      data: {bytecode: polyfillBytecode},
    },
  ],
  getSource: () => Buffer.from('polyfill-source'),
};

const fooModuleCode = '__d(function() {/* code for foo */});';
const fooModuleBytecode = compile(fooModuleCode, {
  sourceURL: 'foo-source',
}).bytecode;
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
        code: fooModuleCode,
        map: [],
        lineCount: 1,
      },
    },
    {
      type: 'bytecode/module',
      data: {
        bytecode: fooModuleBytecode,
      },
    },
  ],
  getSource: () => Buffer.from('foo-source'),
};

const barModuleCode = '__d(function() {/* code for bar */});';
const barModuleBytecode = compile(barModuleCode, {
  sourceURL: 'bar-source',
}).bytecode;
const barModule: Module<> = {
  path: '/root/bar',
  dependencies: new Map(),
  inverseDependencies: new CountingSet(['/root/foo']),
  output: [
    {
      type: 'js/module',
      data: {
        code: barModuleCode,
        map: [],
        lineCount: 1,
      },
    },
    {
      type: 'bytecode/module',
      data: {
        bytecode: barModuleBytecode,
      },
    },
  ],
  getSource: () => Buffer.from('bar-source'),
};

const getRunModuleStatement = (moduleId: number | string) =>
  `require(${JSON.stringify(moduleId)});`;

it('should generate a bundle', () => {
  const {modules, pre, post} = baseBytecodeBundle(
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
      sourceMapUrl: 'http://localhost/bundle.map',
      sourceUrl: null,
    },
  );

  expect(() => validateBytecodeModule(pre[0], 0)).not.toThrow();
  expect(() => validateBytecodeModule(post[0], 0)).not.toThrow();

  // There are two modules
  expect(modules.length).toBe(2);

  // Each modules consists of two bytecode buffers
  expect(modules[0][1].length).toBe(2);

  // The first one is the header
  expect(() => validateBytecodeModule(modules[0][1][0], 0)).not.toThrow();
  expect(() => validateBytecodeModule(modules[1][1][0], 0)).not.toThrow();

  // The second one is the bytecode for the module
  expect(modules[0][1][1]).toBe(fooModuleBytecode);
  expect(modules[1][1][1]).toBe(barModuleBytecode);
});

it('does not add polyfills when `modulesOnly` is used', () => {
  const {pre} = baseBytecodeBundle(
    '/root/foo',
    [polyfill],
    {
      dependencies: new Map([
        ['/root/foo', fooModule],
        ['/root/bar', barModule],
      ]),
      entryPoints: new Set(['foo']),
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
      sourceMapUrl: 'http://localhost/bundle.map',
      sourceUrl: null,
    },
  );

  expect(pre.length).toEqual(0);
});
