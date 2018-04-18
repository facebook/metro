/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const fullSourceMapObject = require('./sourceMapObject');
const getAppendScripts = require('../../lib/getAppendScripts');
const getTransitiveDependencies = require('./helpers/getTransitiveDependencies');
const path = require('path');

const {createRamBundleGroups} = require('../../Bundler/util');
const {wrapModule} = require('./helpers/js');

import type {GetTransformOptions} from '../../Bundler';
import type {ModuleTransportLike} from '../../shared/types.flow';
import type {Graph} from '../DeltaCalculator';
import type {Module} from '../traverseDependencies';

type Options = {|
  +createModuleId: string => number,
  +dev: boolean,
  +excludeSource: boolean,
  +getRunModuleStatement: number => string,
  +getTransformOptions: ?GetTransformOptions,
  +platform: ?string,
  +runBeforeMainModule: $ReadOnlyArray<string>,
  +runModule: boolean,
  +sourceMapUrl: ?string,
|};

export type RamBundleInfo = {|
  getDependencies: string => Set<string>,
  startupModules: $ReadOnlyArray<ModuleTransportLike>,
  lazyModules: $ReadOnlyArray<ModuleTransportLike>,
  groups: Map<number, Set<number>>,
|};

async function getRamBundleInfo(
  entryPoint: string,
  pre: $ReadOnlyArray<Module>,
  graph: Graph,
  options: Options,
): Promise<RamBundleInfo> {
  const modules = [
    ...pre,
    ...graph.dependencies.values(),
    ...getAppendScripts(entryPoint, graph, options),
  ];

  modules.forEach(module => options.createModuleId(module.path));

  const ramModules = modules.map(module => ({
    id: options.createModuleId(module.path),
    code: wrapModule(module, options),
    map: fullSourceMapObject(
      [module],
      {dependencies: new Map(), entryPoints: []},
      {
        excludeSource: options.excludeSource,
      },
    ),
    name: path.basename(module.path),
    sourcePath: module.path,
    source: module.output.source,
    type: module.output.type,
  }));

  const {preloadedModules, ramGroups} = await _getRamOptions(
    entryPoint,
    {
      dev: options.dev,
      platform: options.platform,
    },
    filePath => getTransitiveDependencies(filePath, graph),
    options.getTransformOptions,
  );

  const startupModules = [];
  const lazyModules = [];

  ramModules.forEach(module => {
    if (preloadedModules.hasOwnProperty(module.sourcePath)) {
      startupModules.push(module);
      return;
    }

    if (module.type === 'script' || module.type === 'require') {
      startupModules.push(module);
      return;
    }

    if (module.type === 'asset' || module.type === 'module') {
      lazyModules.push(module);
    }
  });

  const groups = createRamBundleGroups(
    ramGroups,
    lazyModules,
    (
      module: ModuleTransportLike,
      dependenciesByPath: Map<string, ModuleTransportLike>,
    ) => {
      const deps = getTransitiveDependencies(module.sourcePath, graph);
      const output = new Set();

      for (const dependency of deps) {
        const module = dependenciesByPath.get(dependency);

        if (module) {
          output.add(module.id);
        }
      }

      return output;
    },
  );

  return {
    getDependencies: (filePath: string) =>
      getTransitiveDependencies(filePath, graph),
    groups,
    lazyModules,
    startupModules,
  };
}

/**
 * Returns the options needed to create a RAM bundle.
 */
async function _getRamOptions(
  entryFile: string,
  options: {dev: boolean, platform: ?string},
  getDependencies: string => Iterable<string>,
  getTransformOptions: ?GetTransformOptions,
): Promise<{|
  +preloadedModules: {[string]: true},
  +ramGroups: Array<string>,
|}> {
  if (getTransformOptions == null) {
    return {
      preloadedModules: {},
      ramGroups: [],
    };
  }

  const {preloadedModules, ramGroups} = await getTransformOptions(
    [entryFile],
    {dev: options.dev, hot: true, platform: options.platform},
    async x => Array.from(getDependencies),
  );

  return {
    preloadedModules: preloadedModules || {},
    ramGroups: ramGroups || [],
  };
}

module.exports = getRamBundleInfo;
