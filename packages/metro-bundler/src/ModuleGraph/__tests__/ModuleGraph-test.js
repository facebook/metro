/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

const ModuleGraph = require('../ModuleGraph');

const defaults = require('../../defaults');

const FILE_TYPE = 'module';

describe('build setup', () => {
  const buildSetup = ModuleGraph.createBuildSetup(graph, mds => {
    return [...mds].sort((l, r) => l.file.path > r.file.path);
  });
  const polyfillOptions = {getPolyfills: () => ['polyfill-a', 'polyfill-b']};
  const noOptions = {};
  const noEntryPoints = [];

  it('adds a prelude containing start time and `__DEV__` to the build', async () => {
    const result = await buildSetup(noEntryPoints, noOptions);

    const [prelude] = result.modules;
    expect(prelude).toEqual({
      dependencies: [],
      file: {
        code:
          'var __DEV__=true,__BUNDLE_START_TIME__=' +
          'this.nativePerformanceNow?nativePerformanceNow():Date.now();',
        map: null,
        path: '',
        type: 'script',
      },
    });
  });

  it('sets `__DEV__` to false in the prelude if optimization is enabled', async () => {
    const result = await buildSetup(noEntryPoints, {optimize: true});
    const [prelude] = result.modules;
    expect(prelude.file.code).toEqual(
      'var __DEV__=false,__BUNDLE_START_TIME__=' +
        'this.nativePerformanceNow?nativePerformanceNow():Date.now();',
    );
  });

  it('places the module system implementation directly after the prelude', async () => {
    const result = await buildSetup(noEntryPoints, noOptions);
    const [, moduleSystem] = result.modules;
    expect(moduleSystem).toEqual({
      dependencies: [],
      file: {
        code: '',
        path: defaults.moduleSystem,
        type: FILE_TYPE,
      },
    });
  });

  it('places polyfills after the module system', async () => {
    const result = await buildSetup(noEntryPoints, polyfillOptions);
    const list = polyfillOptions.getPolyfills();
    const polyfills = result.modules.slice(2, list.length + 2);
    expect(polyfills).toEqual(list.map(moduleFromPath));
  });

  it('places all entry points and dependencies at the end, post-processed', async () => {
    const entryPoints = ['b', 'c', 'd'];
    const result = await buildSetup(entryPoints, noOptions);
    expect(result.modules.slice(-4)).toEqual(
      ['a', 'b', 'c', 'd'].map(moduleFromPath),
    );
  });
});

function moduleFromPath(path) {
  return {
    dependencies: path === 'b' ? ['a'] : [],
    file: {
      code: '',
      path,
      type: FILE_TYPE,
    },
  };
}

async function graph(entryPoints, platform, options, callback) {
  const modules = Array.from(entryPoints, moduleFromPath);
  const depModules = Array.prototype.concat.apply(
    [],
    modules.map(x => x.dependencies.map(moduleFromPath)),
  );
  return {
    entryModules: modules,
    modules: modules.concat(depModules),
  };
}
