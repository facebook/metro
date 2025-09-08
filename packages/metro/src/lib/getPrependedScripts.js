/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import type Bundler from '../Bundler';
import type DeltaBundler, {Module} from '../DeltaBundler';
import type {TransformInputOptions} from '../DeltaBundler/types';
import type {ResolverInputOptions} from '../shared/types';
import type {ConfigT} from 'metro-config';

import CountingSet from './CountingSet';
import countLines from './countLines';
import getPreludeCode from './getPreludeCode';
import * as transformHelpers from './transformHelpers';
import * as defaults from 'metro-config/private/defaults/defaults';

export default async function getPrependedScripts(
  config: ConfigT,
  options: Omit<TransformInputOptions, 'type'>,
  resolverOptions: ResolverInputOptions,
  bundler: Bundler,
  deltaBundler: DeltaBundler<>,
): Promise<$ReadOnlyArray<Module<>>> {
  // Get all the polyfills from the relevant option params (the
  // `getPolyfills()` method and the `polyfillModuleNames` variable).
  const polyfillModuleNames = config.serializer
    .getPolyfills({
      platform: options.platform,
    })
    .concat(config.serializer.polyfillModuleNames);

  const transformOptions: TransformInputOptions = {
    ...options,
    type: 'script',
  };

  const dependencies = await deltaBundler.getDependencies(
    [defaults.moduleSystem, ...polyfillModuleNames],
    {
      resolve: await transformHelpers.getResolveDependencyFn(
        bundler,
        options.platform,
        resolverOptions,
      ),
      transform: await transformHelpers.getTransformFn(
        [defaults.moduleSystem, ...polyfillModuleNames],
        bundler,
        deltaBundler,
        config,
        transformOptions,
        resolverOptions,
      ),
      unstable_allowRequireContext:
        config.transformer.unstable_allowRequireContext,
      transformOptions,
      onProgress: null,
      lazy: false,
      unstable_enablePackageExports:
        config.resolver.unstable_enablePackageExports,
      shallow: false,
    },
  );

  return [
    _getPrelude({
      dev: options.dev,
      globalPrefix: config.transformer.globalPrefix,
      requireCycleIgnorePatterns: config.resolver.requireCycleIgnorePatterns,
    }),
    ...dependencies.values(),
  ];
}

function _getPrelude({
  dev,
  globalPrefix,
  requireCycleIgnorePatterns,
}: {
  dev: boolean,
  globalPrefix: string,
  requireCycleIgnorePatterns: $ReadOnlyArray<RegExp>,
  ...
}): Module<> {
  const code = getPreludeCode({
    isDev: dev,
    globalPrefix,
    requireCycleIgnorePatterns,
  });
  const name = '__prelude__';

  return {
    dependencies: new Map(),
    getSource: (): Buffer => Buffer.from(code),
    inverseDependencies: new CountingSet(),
    path: name,
    output: [
      {
        type: 'js/script/virtual',
        data: {
          code,
          lineCount: countLines(code),
          map: [],
        },
      },
    ],
  };
}
