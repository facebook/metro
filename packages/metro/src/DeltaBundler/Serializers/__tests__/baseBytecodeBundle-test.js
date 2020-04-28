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

const baseBytecodeBundle = require('../baseBytecodeBundle');
const path = require('path');

const {compile, validateBytecodeModule} = require('metro-hermes-compiler');

const polyfillCode = '__d(function() {/* code for polyfill */});';
const polyfillBytecode = compile(polyfillCode, {
  sourceURL: 'polyfill-source',
}).bytecode;
const polyfill = {
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
const fooModule = {
  path: '/root/foo',
  dependencies: new Map([['./bar', {absolutePath: '/root/bar', data: {}}]]),
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
const barModule = {
  path: '/root/bar',
  dependencies: new Map(),
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

const getRunModuleStatement = moduleId =>
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
      entryPoints: ['foo'],
      importBundleNames: new Set(),
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
      entryPoints: ['foo'],
      importBundleNames: new Set(),
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
  );

  expect(pre.length).toEqual(0);
});
