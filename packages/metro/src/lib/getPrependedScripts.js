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

import type Bundler from '../Bundler';
import type DeltaBundler, {Module} from '../DeltaBundler';
import type {TransformInputOptions} from '../DeltaBundler/types.flow';
import type {ConfigT} from 'metro-config/src/configTypes.flow';

const countLines = require('./countLines');
const getPreludeCode = require('./getPreludeCode');
const transformHelpers = require('./transformHelpers');
const defaults = require('metro-config/src/defaults/defaults');
const {compile} = require('metro-hermes-compiler');

async function getPrependedScripts(
  config: ConfigT,
  options: $Diff<
    TransformInputOptions,
    {type: $PropertyType<TransformInputOptions, 'type'>, ...},
  >,
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
      ),
      transform: await transformHelpers.getTransformFn(
        [defaults.moduleSystem, ...polyfillModuleNames],
        bundler,
        deltaBundler,
        config,
        transformOptions,
      ),
      transformOptions,
      onProgress: null,
      experimentalImportBundleSupport:
        config.transformer.experimentalImportBundleSupport,
      shallow: false,
    },
  );

  return [
    _getPrelude({
      dev: options.dev,
      globalPrefix: config.transformer.globalPrefix,
    }),
    ...dependencies.values(),
  ];
}

function _getPrelude({
  dev,
  globalPrefix,
}: {
  dev: boolean,
  globalPrefix: string,
  ...
}): Module<> {
  const code = getPreludeCode({isDev: dev, globalPrefix});
  const name = '__prelude__';

  return {
    dependencies: new Map(),
    getSource: (): Buffer => Buffer.from(code),
    inverseDependencies: new Set(),
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
      {
        type: 'bytecode/script/virtual',
        data: {
          bytecode: compile(code, {sourceURL: '__prelude__.virtual.js'})
            .bytecode,
        },
      },
    ],
  };
}

module.exports = getPrependedScripts;
