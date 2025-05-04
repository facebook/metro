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

'use strict';

import type Bundler from '../Bundler';
import type DeltaBundler, {TransformFn} from '../DeltaBundler';
import type {
  BundlerResolution,
  TransformInputOptions,
  TransformResultDependency,
} from '../DeltaBundler/types.flow';
import type {TransformOptions} from '../DeltaBundler/Worker';
import type {ResolverInputOptions} from '../shared/types.flow';
import type {RequireContext} from './contextModule';
import type {ConfigT} from 'metro-config';
import type {Type} from 'metro-transform-worker';

import {getContextModuleTemplate} from './contextModuleTemplates';
import isAssetFile from 'metro-resolver/src/utils/isAssetFile';

type InlineRequiresRaw =
  | $ReadOnly<{blockList: $ReadOnly<{[string]: true, ...}>, ...}>
  | boolean;

type TransformOptionsWithRawInlines = $ReadOnly<{
  ...TransformOptions,
  inlineRequires: InlineRequiresRaw,
}>;

const baseIgnoredInlineRequires = [
  'React',
  'react',
  'react/jsx-dev-runtime',
  'react/jsx-runtime',
  'react-compiler-runtime',
  'react-native',
];

async function calcTransformerOptions(
  entryFiles: $ReadOnlyArray<string>,
  bundler: Bundler,
  deltaBundler: DeltaBundler<>,
  config: ConfigT,
  options: TransformInputOptions,
  resolverOptions: ResolverInputOptions,
): Promise<TransformOptionsWithRawInlines> {
  const baseOptions = {
    customTransformOptions: options.customTransformOptions,
    dev: options.dev,
    hot: options.hot,
    inlineRequires: false,
    inlinePlatform: true,
    minify: options.minify,
    platform: options.platform,
    unstable_transformProfile: options.unstable_transformProfile,
  };

  // When we're processing scripts, we don't need to calculate any
  // inlineRequires information, since scripts by definition don't have
  // requires().
  if (options.type === 'script') {
    return {
      ...baseOptions,
      type: 'script',
    };
  }

  const getDependencies = async (path: string) => {
    const dependencies = await deltaBundler.getDependencies([path], {
      resolve: await getResolveDependencyFn(
        bundler,
        options.platform,
        resolverOptions,
      ),
      transform: await getTransformFn(
        [path],
        bundler,
        deltaBundler,
        config,
        {
          ...options,
          minify: false,
        },
        resolverOptions,
      ),
      transformOptions: options,
      onProgress: null,
      lazy: false,
      unstable_allowRequireContext:
        config.transformer.unstable_allowRequireContext,
      unstable_enablePackageExports:
        config.resolver.unstable_enablePackageExports,
      shallow: false,
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
    inlinePlatform:
      transform?.unstable_inlinePlatform != null
        ? transform.unstable_inlinePlatform
        : true,
    inlineRequires: transform?.inlineRequires || false,
    experimentalImportSupport: transform?.experimentalImportSupport || false,
    unstable_disableES6Transforms:
      transform?.unstable_disableES6Transforms || false,
    unstable_memoizeInlineRequires:
      transform?.unstable_memoizeInlineRequires || false,
    unstable_nonMemoizedInlineRequires:
      transform?.unstable_nonMemoizedInlineRequires || [],
    nonInlinedRequires:
      transform?.nonInlinedRequires || baseIgnoredInlineRequires,
    type: 'module',
  };
}

function removeInlineRequiresBlockListFromOptions(
  path: string,
  inlineRequires: InlineRequiresRaw,
): boolean {
  if (typeof inlineRequires === 'object') {
    return !(path in inlineRequires.blockList);
  }

  return inlineRequires;
}

async function getTransformFn(
  entryFiles: $ReadOnlyArray<string>,
  bundler: Bundler,
  deltaBundler: DeltaBundler<>,
  config: ConfigT,
  options: TransformInputOptions,
  resolverOptions: ResolverInputOptions,
): Promise<TransformFn<>> {
  const {inlineRequires, ...transformOptions} = await calcTransformerOptions(
    entryFiles,
    bundler,
    deltaBundler,
    config,
    options,
    resolverOptions,
  );
  const assetExts = new Set(config.resolver.assetExts);

  return async (modulePath: string, requireContext: ?RequireContext) => {
    let templateBuffer: Buffer;

    if (requireContext) {
      const graph = await bundler.getDependencyGraph();

      // TODO: Check delta changes to avoid having to look over all files each time
      // this is a massive performance boost.

      // Search against all files in a subtree.
      const files = Array.from(
        graph.matchFilesWithContext(requireContext.from, {
          filter: requireContext.filter,
          recursive: requireContext.recursive,
        }),
      );

      const template = getContextModuleTemplate(
        requireContext.mode,
        requireContext.from,
        files,
      );

      templateBuffer = Buffer.from(template);
    }

    return await bundler.transformFile(
      modulePath,
      {
        ...transformOptions,
        type: getType(transformOptions.type, modulePath, assetExts),
        inlineRequires: removeInlineRequiresBlockListFromOptions(
          modulePath,
          inlineRequires,
        ),
      },
      templateBuffer,
    );
  };
}

function getType(
  type: string,
  filePath: string,
  assetExts: $ReadOnlySet<string>,
): Type {
  if (type === 'script') {
    return type;
  }

  if (isAssetFile(filePath, assetExts)) {
    return 'asset';
  }

  return 'module';
}

async function getResolveDependencyFn(
  bundler: Bundler,
  platform: ?string,
  resolverOptions: ResolverInputOptions,
): Promise<
  (from: string, dependency: TransformResultDependency) => BundlerResolution,
> {
  const dependencyGraph = await await bundler.getDependencyGraph();

  return (from: string, dependency: TransformResultDependency) =>
    dependencyGraph.resolveDependency(
      from,
      dependency,
      platform ?? null,
      resolverOptions,
    );
}

module.exports = {
  getTransformFn,
  getResolveDependencyFn,
};
