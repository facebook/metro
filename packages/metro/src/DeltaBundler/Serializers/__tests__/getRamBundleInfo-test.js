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
import type {JsOutput} from 'metro-transform-worker';

import CountingSet from '../../../lib/CountingSet';

const getRamBundleInfo = require('../getRamBundleInfo');

function createModule(
  name: string,
  dependencies: $ReadOnlyArray<string>,
  type: JsOutput['type'] = 'js/module',
): [string, Module<>] {
  return [
    `/root/${name}.js`,
    {
      path: `/root/${name}.js`,
      dependencies: new Map(
        dependencies.map(dep => [
          dep,
          {
            absolutePath: `/root/${dep}.js`,
            data: {data: {asyncType: null, locs: [], key: dep}, name: dep},
          },
        ]),
      ),
      // FIXME: Populate inverseDependencies correctly.
      inverseDependencies: new CountingSet(),
      getSource: () => Buffer.from(`source of ${name}`),
      output: [
        {
          type,
          data: {code: `__d(function() {${name}()});`, lineCount: 1, map: []},
        },
      ],
    },
  ];
}

const transformOptions: TransformInputOptions = {
  customTransformOptions: {},
  dev: true,
  hot: true,
  minify: true,
  platform: 'web',
  type: 'module',
  unstable_transformProfile: 'default',
};

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
  transformOptions,
};

const pre = [createModule('pre', [], 'js/script')[1]];

const getRunModuleStatement = (moduleId: string | number) =>
  `require(${JSON.stringify(moduleId)});`;

it('should return the RAM bundle info', async () => {
  expect(
    await getRamBundleInfo(
      '/root/entry.js',
      pre,
      {...graph, entryPoints: new Set(['/root/entry.js'])},
      {
        asyncRequireModulePath: '',
        // $FlowFixMe[incompatible-call] createModuleId assumes numeric IDs - is this too strict?
        createModuleId: path => path,
        dev: true,
        excludeSource: false,
        getRunModuleStatement,
        getTransformOptions: async () => ({
          preloadedModules: {},
          ramGroups: [],
        }),
        includeAsyncPaths: false,
        inlineSourceMap: false,
        modulesOnly: false,
        platform: null,
        processModuleFilter: module => true,
        projectRoot: '/root',
        runBeforeMainModule: [],
        runModule: true,
        serverRoot: '/root',
        shouldAddToIgnoreList: () => false,
        sourceMapUrl: 'http://localhost/bundle.map',
        sourceUrl: null,
      },
    ),
  ).toMatchSnapshot();
});

it('emits x_google_ignoreList based on shouldAddToIgnoreList', async () => {
  expect(
    await getRamBundleInfo(
      '/root/entry.js',
      pre,
      {...graph, entryPoints: new Set(['/root/entry.js'])},
      {
        asyncRequireModulePath: '',
        // $FlowFixMe[incompatible-call] createModuleId assumes numeric IDs - is this too strict?
        createModuleId: path => path,
        dev: true,
        excludeSource: false,
        getRunModuleStatement,
        getTransformOptions: async () => ({
          preloadedModules: {},
          ramGroups: [],
        }),
        includeAsyncPaths: false,
        inlineSourceMap: false,
        modulesOnly: false,
        platform: null,
        processModuleFilter: module => true,
        projectRoot: '/root',
        runBeforeMainModule: [],
        runModule: true,
        serverRoot: '/root',
        shouldAddToIgnoreList: () => true,
        sourceMapUrl: 'http://localhost/bundle.map',
        sourceUrl: null,
      },
    ),
  ).toMatchSnapshot();
});

it('should use the preloadedModules and ramGroup configs to build a RAM bundle', async () => {
  const getTransformOptions = async () => ({
    preloadedModules: {'/root/entry2.js': true},
    ramGroups: ['/root/foo.js'],
  });

  const bundleInfo = await getRamBundleInfo(
    '/root/entry.js',
    pre,
    {...graph, entryPoints: new Set(['/root/entry.js'])},
    {
      asyncRequireModulePath: '',
      // $FlowFixMe[incompatible-call] createModuleId assumes numeric IDs - is this too strict?
      createModuleId: path => path,
      dev: true,
      excludeSource: false,
      getRunModuleStatement,
      getTransformOptions,
      includeAsyncPaths: false,
      inlineSourceMap: null,
      modulesOnly: false,
      platform: null,
      processModuleFilter: module => true,
      projectRoot: '/root',
      runBeforeMainModule: [],
      runModule: true,
      serverRoot: '/root',
      shouldAddToIgnoreList: () => false,
      sourceMapUrl: 'http://localhost/bundle.map',
      sourceUrl: null,
    },
  );

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
