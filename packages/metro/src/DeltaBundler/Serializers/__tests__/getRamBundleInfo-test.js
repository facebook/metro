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

const getRamBundleInfo = require('../getRamBundleInfo');

function createModule(name, dependencies, type = 'js/module') {
  return [
    `/root/${name}.js`,
    {
      path: `/root/${name}.js`,
      dependencies: new Map(
        dependencies.map(dep => [
          dep,
          {absolutePath: `/root/${dep}.js`, data: {isAsync: false, name: dep}},
        ]),
      ),
      getSource: () => Buffer.from(`source of ${name}`),
      output: [
        {type, data: {code: `__d(function() {${name}()});`, lineCount: 1}},
      ],
    },
  ];
}

const graph = {
  dependencies: new Map([
    createModule('entry', ['foo', 'entry2']),
    createModule('entry2', ['foo2']),
    createModule('foo2', []),
    createModule('foo', ['bar', 'baz', 'qux']),
    createModule('baz', [], 'js/module/asset'),
    createModule('bar', []),
    createModule('qux', []),
  ]),
  importBundleNames: new Set(),
};

const pre = [createModule('pre', [], 'js/script')[1]];

const getRunModuleStatement = moduleId =>
  `require(${JSON.stringify(moduleId)});`;

it('should return the RAM bundle info', async () => {
  expect(
    await getRamBundleInfo('/root/entry.js', pre, graph, {
      processModuleFilter: module => true,
      createModuleId: path => path,
      excludeSource: false,
      getRunModuleStatement,
      getTransformOptions: () => ({
        preloadedModules: {},
        ramGroups: [],
      }),
      dev: true,
      projectRoot: '/root',
      runBeforeMainModule: [],
      runModule: true,
      sourceMapUrl: 'http://localhost/bundle.map',
    }),
  ).toMatchSnapshot();
});

it('should use the preloadedModules and ramGroup configs to build a RAM bundle', async () => {
  const getTransformOptions = async () => ({
    preloadedModules: {'/root/entry2.js': true},
    ramGroups: ['/root/foo.js'],
  });

  const bundleInfo = await getRamBundleInfo('/root/entry.js', pre, graph, {
    processModuleFilter: module => true,
    createModuleId: path => path,
    excludeSource: false,
    getRunModuleStatement,
    getTransformOptions,
    dev: true,
    projectRoot: '/root',
    runBeforeMainModule: [],
    runModule: true,
    sourceMapUrl: 'http://localhost/bundle.map',
  });

  expect(bundleInfo.startupModules.map(({id}) => id)).toEqual([
    '/root/pre.js',
    '/root/entry2.js',
    'require-/root/entry.js',
    'source-map',
  ]);

  expect(bundleInfo.lazyModules.map(({id}) => id)).toEqual([
    '/root/entry.js',
    '/root/foo2.js',
    '/root/foo.js',
    '/root/baz.js',
    '/root/bar.js',
    '/root/qux.js',
  ]);

  expect(bundleInfo.groups).toEqual(
    new Map([
      [
        '/root/foo.js',
        new Set(['/root/bar.js', '/root/baz.js', '/root/qux.js']),
      ],
    ]),
  );
});
