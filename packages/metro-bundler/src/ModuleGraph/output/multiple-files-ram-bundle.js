/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 */
'use strict';

const MAGIC_UNBUNDLE_NUMBER = require('../../shared/output/unbundle/magic-number');
const MAGIC_UNBUNDLE_FILENAME = 'UNBUNDLE';
const JS_MODULES = 'js-modules';

const buildSourceMapWithMetaData = require('../../shared/output/unbundle/build-unbundle-sourcemap-with-metadata.js');
const path = require('path');

const {concat, getModuleCode, partition, toModuleTransport} = require('./util');

import type {FBIndexMap} from '../../lib/SourceMap.js';
import type {OutputFn} from '../types.flow';

function asMultipleFilesRamBundle({
  filename,
  idForPath,
  modules,
  requireCalls,
  preloadedModules,
}) {
  const [startup, deferred] = partition(modules, preloadedModules);
  const startupModules = Array.from(concat(startup, requireCalls));
  const deferredModules = deferred.map(m => toModuleTransport(m, idForPath));
  const magicFileContents = new Buffer(4);

  // Just concatenate all startup modules, one after the other.
  const code = startupModules.map(m => getModuleCode(m, idForPath)).join('\n');

  // Write one file per module, wrapped with __d() call if it proceeds.
  const extraFiles = new Map();
  deferredModules.forEach(deferredModule => {
    extraFiles.set(
      path.join(JS_MODULES, deferredModule.id + '.js'),
      deferredModule.code,
    );
  });

  // Prepare and write magic number file.
  magicFileContents.writeUInt32LE(MAGIC_UNBUNDLE_NUMBER, 0);
  extraFiles.set(MAGIC_UNBUNDLE_FILENAME, magicFileContents);

  // Create the source map (with no module groups, as they are ignored).
  const map = buildSourceMapWithMetaData({
    fixWrapperOffset: false,
    lazyModules: deferredModules,
    moduleGroups: null,
    startupModules: startupModules.map(m => toModuleTransport(m, idForPath)),
  });

  return {code, extraFiles, map};
}

function createBuilder(
  preloadedModules: Set<string>,
  ramGroupHeads: ?$ReadOnlyArray<string>,
): OutputFn<FBIndexMap> {
  return x => asMultipleFilesRamBundle({...x, preloadedModules, ramGroupHeads});
}

exports.createBuilder = createBuilder;
