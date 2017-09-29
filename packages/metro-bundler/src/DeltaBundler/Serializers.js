/**
 * Copyright (c) 2015-present, Facebook, Inc.
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

const DeltaPatcher = require('./DeltaPatcher');

const {fromRawMappings} = require('../Bundler/source-map');

import type {BundleOptions} from '../Server';
import type {MappingsMap} from '../lib/SourceMap';
import type DeltaBundler, {Options as BuildOptions} from './';
import type {DeltaEntry, DeltaTransformResponse} from './DeltaTransformer';

export type Options = BundleOptions & {
  deltaBundleId: ?string,
};

/**
 * This module contains many serializers for the Delta Bundler. Each serializer
 * returns a string representation for any specific type of bundle, which can
 * be directly sent to the devices.
 */

async function deltaBundle(
  deltaBundler: DeltaBundler,
  options: Options,
): Promise<{bundle: string, numModifiedFiles: number}> {
  const {id, delta} = await _build(deltaBundler, {
    ...options,
    wrapModules: true,
  });

  function stringifyModule([id, module]) {
    return [id, module ? module.code : undefined];
  }

  const bundle = JSON.stringify({
    id,
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
  options: Options,
): Promise<string> {
  const {id, delta} = await _build(deltaBundler, {
    ...options,
    wrapModules: true,
  });

  const deltaPatcher = DeltaPatcher.get(id).applyDelta(delta);

  return fromRawMappings(deltaPatcher.getAllModules()).toString(undefined, {
    excludeSource: options.excludeSource,
  });
}

async function fullSourceMapObject(
  deltaBundler: DeltaBundler,
  options: Options,
): Promise<MappingsMap> {
  const {id, delta} = await _build(deltaBundler, {
    ...options,
    wrapModules: true,
  });

  const deltaPatcher = DeltaPatcher.get(id).applyDelta(delta);

  return fromRawMappings(deltaPatcher.getAllModules()).toMap(undefined, {
    excludeSource: options.excludeSource,
  });
}

/**
 * Returns the full JS bundle, which can be directly parsed by a JS interpreter
 */
async function fullBundle(
  deltaBundler: DeltaBundler,
  options: Options,
): Promise<{bundle: string, numModifiedFiles: number, lastModified: Date}> {
  const {id, delta} = await _build(deltaBundler, {
    ...options,
    wrapModules: true,
  });

  const deltaPatcher = DeltaPatcher.get(id).applyDelta(delta);
  const code = deltaPatcher.getAllModules().map(m => m.code);

  return {
    bundle: code.join('\n'),
    lastModified: deltaPatcher.getLastModifiedDate(),
    numModifiedFiles: deltaPatcher.getLastNumModifiedFiles(),
  };
}

async function getAllModules(
  deltaBundler: DeltaBundler,
  options: Options,
): Promise<Array<DeltaEntry>> {
  const {id, delta} = await _build(deltaBundler, {
    ...options,
    wrapModules: true,
  });

  return DeltaPatcher.get(id)
    .applyDelta(delta)
    .getAllModules();
}

async function _build(
  deltaBundler: DeltaBundler,
  options: BuildOptions,
): Promise<{id: string, delta: DeltaTransformResponse}> {
  const {deltaTransformer, id} = await deltaBundler.getDeltaTransformer(
    options,
  );

  return {
    id,
    delta: await deltaTransformer.getDelta(),
  };
}

module.exports = {
  deltaBundle,
  fullBundle,
  fullSourceMap,
  fullSourceMapObject,
  getAllModules,
};
