/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

import type {TransformInputOptions} from '../DeltaBundler/types.flow';
import type {ResolverInputOptions} from '../shared/types.flow';

const canonicalize = require('metro-core/src/canonicalize');

export opaque type GraphId: string = string;

function getGraphId(
  entryFile: string,
  options: TransformInputOptions,
  {
    shallow,
    experimentalImportBundleSupport,
    unstable_allowRequireContext,
    resolverOptions,
  }: $ReadOnly<{
    shallow: boolean,
    experimentalImportBundleSupport: boolean,
    unstable_allowRequireContext: boolean,
    resolverOptions: ResolverInputOptions,
  }>,
): GraphId {
  return JSON.stringify(
    {
      entryFile,
      options: {
        customResolverOptions: resolverOptions.customResolverOptions ?? {},
        customTransformOptions: options.customTransformOptions ?? null,
        dev: options.dev,
        experimentalImportSupport: options.experimentalImportSupport || false,
        hot: options.hot,
        minify: options.minify,
        unstable_disableES6Transforms: options.unstable_disableES6Transforms,
        platform: options.platform != null ? options.platform : null,
        runtimeBytecodeVersion: options.runtimeBytecodeVersion,
        type: options.type,
        experimentalImportBundleSupport,
        unstable_allowRequireContext,
        shallow,
        unstable_transformProfile:
          options.unstable_transformProfile || 'default',
      },
    },
    canonicalize,
  );
}

module.exports = getGraphId;
