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

import type {BundleOptions} from '../../shared/types.flow';
import type DeltaBundler from '../';
import type DeltaTransformer, {
  DeltaTransformResponse,
} from '../DeltaTransformer';

export type DeltaOptions = BundleOptions & {
  deltaBundleId: ?string,
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
};
