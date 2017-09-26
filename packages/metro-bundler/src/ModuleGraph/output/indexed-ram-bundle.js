/**
 * Copyright (c) 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @format
 */

'use strict';

const buildSourceMapWithMetaData = require('../../shared/output/unbundle/build-unbundle-sourcemap-with-metadata.js');

const {createRamBundleGroups} = require('../../Bundler/util');
const {
  buildTableAndContents,
  createModuleGroups,
} = require('../../shared/output/unbundle/as-indexed-file');
const {concat, getModuleCode, partition, toModuleTransport} = require('./util');

import type {FBIndexMap} from '../../lib/SourceMap.js';
import type {OutputFn} from '../types.flow';

function asIndexedRamBundle({
  filename,
  idsForPath,
  modules,
  preloadedModules,
  ramGroupHeads,
  requireCalls,
}) {
  const idForPath = x => idsForPath(x).moduleId;
  const [startup, deferred] = partition(modules, preloadedModules);
  const startupModules = Array.from(concat(startup, requireCalls));
  const deferredModules = deferred.map(m => toModuleTransport(m, idsForPath));
  const ramGroups = createRamBundleGroups(
    ramGroupHeads || [],
    deferredModules,
    subtree,
  );
  const moduleGroups = createModuleGroups(ramGroups, deferredModules);

  const tableAndContents = buildTableAndContents(
    startupModules.map(m => getModuleCode(m, idForPath)).join('\n'),
    deferredModules,
    moduleGroups,
    'utf8',
  );

  return {
    code: Buffer.concat(tableAndContents),
    map: buildSourceMapWithMetaData({
      fixWrapperOffset: false,
      lazyModules: deferredModules,
      moduleGroups,
      startupModules: startupModules.map(m => toModuleTransport(m, idsForPath)),
    }),
  };
}

function* subtree(moduleTransport, moduleTransportsByPath, seen = new Set()) {
  seen.add(moduleTransport.id);
  for (const {path} of moduleTransport.dependencies) {
    const dependency = moduleTransportsByPath.get(path);
    if (dependency && !seen.has(dependency.id)) {
      yield dependency.id;
      yield* subtree(dependency, moduleTransportsByPath, seen);
    }
  }
}

function createBuilder(
  preloadedModules: Set<string>,
  ramGroupHeads: ?$ReadOnlyArray<string>,
): OutputFn<FBIndexMap> {
  return x => asIndexedRamBundle({...x, preloadedModules, ramGroupHeads});
}

exports.createBuilder = createBuilder;
