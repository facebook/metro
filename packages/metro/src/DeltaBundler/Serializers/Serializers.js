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

const DeltaPatcher = require('../DeltaPatcher');
const RamBundle = require('./RamBundle');

const stableHash = require('metro-cache/src/stableHash');
const toLocalPath = require('../../node-haste/lib/toLocalPath');

const {getAssetData} = require('../../Assets');
const {createRamBundleGroups} = require('../../Bundler/util');
const {fromRawMappings} = require('metro-source-map');

import type {AssetData} from '../../Assets';
import type {GetTransformOptions} from '../../Bundler';
import type {BundleOptions, ModuleTransportLike} from '../../shared/types.flow';
import type DeltaBundler from '../';
import type DeltaTransformer, {
  DeltaEntry,
  DeltaTransformResponse,
} from '../DeltaTransformer';
import type {BabelSourceMap} from '@babel/core';

export type DeltaOptions = BundleOptions & {
  deltaBundleId: ?string,
};

export type RamModule = ModuleTransportLike;

export type RamBundleInfo = {
  getDependencies: string => Set<string>,
  startupModules: $ReadOnlyArray<RamModule>,
  lazyModules: $ReadOnlyArray<RamModule>,
  groups: Map<number, Set<number>>,
};

/**
 * This module contains many serializers for the Delta Bundler. Each serializer
 * returns a string representation for any specific type of bundle, which can
 * be directly sent to the devices.
 */

async function deltaBundle(
  deltaBundler: DeltaBundler,
  clientId: string,
  options: DeltaOptions,
): Promise<{bundle: string, numModifiedFiles: number}> {
  const {delta} = await _build(deltaBundler, clientId, options);

  function stringifyModule([id, module]) {
    return [id, module ? module.code : undefined];
  }

  const bundle = JSON.stringify({
    id: delta.id,
    pre: Array.from(delta.pre).map(stringifyModule),
    post: Array.from(delta.post).map(stringifyModule),
    delta: Array.from(delta.delta).map(stringifyModule),
    reset: delta.reset,
  });

  return {
    bundle,
    numModifiedFiles: delta.pre.size + delta.post.size + delta.delta.size,
  };
}

async function fullSourceMap(
  deltaBundler: DeltaBundler,
  options: BundleOptions,
): Promise<string> {
  const {modules} = await _getAllModules(deltaBundler, options);

  return fromRawMappings(modules).toString(undefined, {
    excludeSource: options.excludeSource,
  });
}

async function fullSourceMapObject(
  deltaBundler: DeltaBundler,
  options: BundleOptions,
): Promise<BabelSourceMap> {
  const {modules} = await _getAllModules(deltaBundler, options);

  return fromRawMappings(modules).toMap(undefined, {
    excludeSource: options.excludeSource,
  });
}

/**
 * Returns the full JS bundle, which can be directly parsed by a JS interpreter
 */
async function fullBundle(
  deltaBundler: DeltaBundler,
  options: BundleOptions,
): Promise<{bundle: string, numModifiedFiles: number, lastModified: Date}> {
  const {modules, numModifiedFiles, lastModified} = await _getAllModules(
    deltaBundler,
    options,
  );

  const code = modules.map(m => m.code);

  return {
    bundle: code.join('\n'),
    lastModified,
    numModifiedFiles,
  };
}

async function getAllModules(
  deltaBundler: DeltaBundler,
  options: BundleOptions,
): Promise<$ReadOnlyArray<DeltaEntry>> {
  const {modules} = await _getAllModules(deltaBundler, options);

  return modules;
}

async function _getAllModules(
  deltaBundler: DeltaBundler,
  options: BundleOptions,
): Promise<{
  modules: $ReadOnlyArray<DeltaEntry>,
  numModifiedFiles: number,
  lastModified: Date,
  deltaTransformer: DeltaTransformer,
}> {
  const clientId = '__SERVER__' + stableHash(options).toString('hex');

  const deltaPatcher = DeltaPatcher.get(clientId);

  options = {
    ...options,
    deltaBundleId: deltaPatcher.getLastBundleId(),
  };

  const {delta, deltaTransformer} = await _build(
    deltaBundler,
    clientId,
    options,
  );

  const modules = deltaPatcher
    .applyDelta(delta)
    .getAllModules(deltaBundler.getPostProcessModulesFn(options.entryFile));

  return {
    deltaTransformer,
    lastModified: deltaPatcher.getLastModifiedDate(),
    modules,
    numModifiedFiles: deltaPatcher.getLastNumModifiedFiles(),
  };
}

async function getRamBundleInfo(
  deltaBundler: DeltaBundler,
  options: BundleOptions,
  getTransformOptions: ?GetTransformOptions,
): Promise<RamBundleInfo> {
  const {modules, deltaTransformer} = await _getAllModules(
    deltaBundler,
    options,
  );

  const ramModules = modules.map(module => ({
    id: module.id,
    code: module.code,
    map: fromRawMappings([module]).toMap(module.path, {
      excludeSource: options.excludeSource,
    }),
    name: module.name,
    sourcePath: module.path,
    source: module.source,
    type: module.type,
  }));

  const {preloadedModules, ramGroups} = await RamBundle.getRamOptions(
    options.entryFile,
    {
      dev: options.dev,
      platform: options.platform,
    },
    await deltaTransformer.getDependenciesFn(),
    getTransformOptions,
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

  const getDependencies = await deltaTransformer.getDependenciesFn();

  const groups = createRamBundleGroups(
    ramGroups,
    lazyModules,
    (module: RamModule, dependenciesByPath: Map<string, RamModule>) => {
      const deps = getDependencies(module.sourcePath);
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
    getDependencies,
    groups,
    lazyModules,
    startupModules,
  };
}

async function getAssets(
  deltaBundler: DeltaBundler,
  options: BundleOptions,
  projectRoots: $ReadOnlyArray<string>,
): Promise<$ReadOnlyArray<AssetData>> {
  const {modules} = await _getAllModules(deltaBundler, options);

  const assets = await Promise.all(
    modules.map(async module => {
      if (module.type === 'asset') {
        const localPath = toLocalPath(projectRoots, module.path);

        return getAssetData(
          module.path,
          localPath,
          options.assetPlugins,
          options.platform,
        );
      }
      return null;
    }),
  );

  return assets.filter(Boolean);
}

async function _build(
  deltaBundler: DeltaBundler,
  clientId: string,
  options: DeltaOptions,
): Promise<{
  delta: DeltaTransformResponse,
  deltaTransformer: DeltaTransformer,
}> {
  const deltaTransformer = await deltaBundler.getDeltaTransformer(
    clientId,
    options,
  );

  const delta = await deltaTransformer.getDelta(options.deltaBundleId);

  return {
    delta,
    deltaTransformer,
  };
}

module.exports = {
  deltaBundle,
  fullBundle,
  fullSourceMap,
  fullSourceMapObject,
  getAllModules,
  getAssets,
  getRamBundleInfo,
};
