/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

const buildSourcemapWithMetadata = require('../../shared/output/RamBundle/buildSourcemapWithMetadata.js');
const invariant = require('fbjs/lib/invariant');

const {createRamBundleGroups} = require('../../Bundler/util');
const {
  buildTableAndContents,
  createModuleGroups,
} = require('../../shared/output/RamBundle/as-indexed-file');
const {concat, getModuleCode, partition, toModuleTransport} = require('./util');

import type {OutputFn} from '../types.flow';
import type {FBIndexMap} from 'metro-source-map';

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
  for (const m of deferredModules) {
    invariant(
      m.id >= 0,
      'A script (non-module) cannot be part of the deferred modules of a RAM bundle ' +
        `(\`${m.sourcePath}\`, id=${m.id})`,
    );
  }
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
    map: buildSourcemapWithMetadata({
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
