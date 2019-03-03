/**
 * Copyright (c) Facebook, Inc. and its affiliates.
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
const nullthrows = require('nullthrows');
const path = require('path');

const {createRamBundleGroups} = require('../../Bundler/util');
const {isJsModule, wrapModule} = require('./helpers/js');

import type {ModuleTransportLike} from '../../shared/types.flow';
import type {Graph, Module, SerializerOptions} from '../types.flow';
import type {GetTransformOptions} from 'metro-config/src/configTypes.flow.js';

type Options = {|
  ...SerializerOptions,
  +excludeSource: boolean,
  +getTransformOptions: ?GetTransformOptions,
  +platform: ?string,
|};

export type RamBundleInfo = {|
  getDependencies: string => Set<string>,
  startupModules: $ReadOnlyArray<ModuleTransportLike>,
  lazyModules: $ReadOnlyArray<ModuleTransportLike>,
  groups: Map<number, Set<number>>,
|};

async function getRamBundleInfo(
  entryPoint: string,
  pre: $ReadOnlyArray<Module<>>,
  graph: Graph<>,
  options: Options,
): Promise<RamBundleInfo> {
  let modules = [...pre, ...graph.dependencies.values()];
  modules = modules.concat(getAppendScripts(entryPoint, modules, options));

  modules.forEach(module => options.createModuleId(module.path));

  const ramModules = modules
    .filter(isJsModule)
    .filter(options.processModuleFilter)
    .map(module => ({
      id: options.createModuleId(module.path),
      code: wrapModule(module, options),
      map: fullSourceMapObject([module], {
        excludeSource: options.excludeSource,
        processModuleFilter: options.processModuleFilter,
      }),
      name: path.basename(module.path),
      sourcePath: module.path,
      source: module.getSource().toString(),
      type: nullthrows(module.output.find(({type}) => type.startsWith('js')))
        .type,
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

    if (module.type.startsWith('js/script')) {
      startupModules.push(module);
      return;
    }

    if (module.type.startsWith('js/module')) {
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
