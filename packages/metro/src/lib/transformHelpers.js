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

const path = require('path');

import type Bundler from '../Bundler';
import type {WorkerOptions} from '../DeltaBundler/Worker';
import type DeltaBundler, {TransformFn} from '../DeltaBundler';
import type {
  CustomTransformOptions,
  TransformOptions,
  Type,
} from '../JSTransformer/worker';
import type {ConfigT} from 'metro-config/src/configTypes.flow';

type InlineRequiresRaw = {+blacklist: {[string]: true}} | boolean;
type WorkerOptionsWithRawInlines = {|
  ...WorkerOptions,
  +transformOptions: {
    ...TransformOptions,
    +inlineRequires: InlineRequiresRaw,
  },
|};

type TransformInputOptions = {|
  +customTransformOptions: CustomTransformOptions,
  +dev: boolean,
  +hot: boolean,
  +minify: boolean,
  +onProgress: ?(doneCont: number, totalCount: number) => mixed,
  +platform: ?string,
  +type: 'module' | 'script',
|};

async function calcTransformerOptions(
  entryFiles: $ReadOnlyArray<string>,
  bundler: Bundler,
  deltaBundler: DeltaBundler<>,
  config: ConfigT,
  options: TransformInputOptions,
): Promise<WorkerOptionsWithRawInlines> {
  const transformOptionsForBlacklist = {
    customTransformOptions: options.customTransformOptions,
    dev: options.dev,
    enableBabelRCLookup: config.transformer.enableBabelRCLookup,
    hot: options.hot,
    inlineRequires: false,
    minify: options.minify,
    platform: options.platform,
    projectRoot: config.projectRoot,
  };

  const baseOptions = {
    assetPlugins: config.transformer.assetPlugins,
    assetRegistryPath: config.transformer.assetRegistryPath,
    asyncRequireModulePath: config.transformer.asyncRequireModulePath,
    babelTransformerPath: config.transformer.babelTransformerPath,
    dynamicDepsInPackages: config.transformer.dynamicDepsInPackages,
    minifierPath: config.transformer.minifierPath,
    optimizationSizeLimit: config.transformer.optimizationSizeLimit,
  };

  // When we're processing scripts, we don't need to calculate any
  // inlineRequires information, since scripts by definition don't have
  // requires().
  if (options.type === 'script') {
    return {
      ...baseOptions,
      transformOptions: transformOptionsForBlacklist,
      type: 'script',
    };
  }

  const getDependencies = async path => {
    const {dependencies} = await deltaBundler.buildGraph([path], {
      resolve: await getResolveDependencyFn(bundler, options.platform),
      transform: await getTransformFn([path], bundler, deltaBundler, config, {
        ...options,
        minify: false,
      }),
      onProgress: null,
    });

    return Array.from(dependencies.keys());
  };

  const {transform} = await config.transformer.getTransformOptions(
    entryFiles,
    {dev: options.dev, hot: options.hot, platform: options.platform},
    getDependencies,
  );

  return {
    ...baseOptions,
    transformOptions: {
      ...transformOptionsForBlacklist,
      experimentalImportSupport: transform.experimentalImportSupport || false,
      inlineRequires: transform.inlineRequires || false,
    },
    type: 'module',
  };
}

function removeInlineRequiresBlacklistFromOptions(
  path: string,
  inlineRequires: InlineRequiresRaw,
): boolean {
  if (typeof inlineRequires === 'object') {
    return !(path in inlineRequires.blacklist);
  }

  return inlineRequires;
}

async function getTransformFn(
  entryFiles: $ReadOnlyArray<string>,
  bundler: Bundler,
  deltaBundler: DeltaBundler<>,
  config: ConfigT,
  options: TransformInputOptions,
): Promise<TransformFn<>> {
  const {
    transformOptions: {inlineRequires, ...transformOptions},
    ...workerOptions
  } = await calcTransformerOptions(
    entryFiles,
    bundler,
    deltaBundler,
    config,
    options,
  );

  return async (path: string) => {
    return await bundler.transformFile(path, {
      ...workerOptions,
      type: getType(workerOptions.type, path, config.resolver.assetExts),
      transformOptions: {
        ...transformOptions,
        inlineRequires: removeInlineRequiresBlacklistFromOptions(
          path,
          inlineRequires,
        ),
      },
    });
  };
}

function getType(
  type: string,
  filePath: string,
  assetExts: $ReadOnlyArray<string>,
): Type {
  if (type === 'script') {
    return type;
  }

  if (assetExts.indexOf(path.extname(filePath).slice(1)) !== -1) {
    return 'asset';
  }

  return 'module';
}

async function getResolveDependencyFn(
  bundler: Bundler,
  platform: ?string,
): Promise<(from: string, to: string) => string> {
  const dependencyGraph = await bundler.getDependencyGraph();

  return (from: string, to: string) =>
    dependencyGraph.resolveDependency(from, to, platform);
}

module.exports = {
  getTransformFn,
  getResolveDependencyFn,
};
