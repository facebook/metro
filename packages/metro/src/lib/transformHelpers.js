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
import type DeltaBundler, {TransformFn} from '../DeltaBundler';
import type {
  TransformContextFn,
  TransformInputOptions,
  RequireContext,
} from '../DeltaBundler/types.flow';
import type {ContextMode} from '../ModuleGraph/worker/collectDependencies';
import type {TransformOptions} from '../DeltaBundler/Worker';
import type {ConfigT} from 'metro-config/src/configTypes.flow';
import type {Type} from 'metro-transform-worker';

import {getContextModuleTemplate} from './contextModuleTemplates';
import {getContextModuleId, fileMatchesContext} from './contextModule';

const path = require('path');

type InlineRequiresRaw = {+blockList: {[string]: true, ...}, ...} | boolean;

type TransformOptionsWithRawInlines = {
  ...TransformOptions,
  +inlineRequires: InlineRequiresRaw,
};

const baseIgnoredInlineRequires = ['React', 'react', 'react-native'];

async function calcTransformerOptions(
  entryFiles: $ReadOnlyArray<string>,
  bundler: Bundler,
  deltaBundler: DeltaBundler<>,
  config: ConfigT,
  options: TransformInputOptions,
): Promise<TransformOptionsWithRawInlines> {
  const baseOptions = {
    customTransformOptions: options.customTransformOptions,
    dev: options.dev,
    hot: options.hot,
    inlineRequires: false,
    inlinePlatform: true,
    minify: options.minify,
    platform: options.platform,
    runtimeBytecodeVersion: options.runtimeBytecodeVersion,
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
      resolve: await getResolveDependencyFn(bundler, options.platform),
      transformContext: await getTransformContextFn(
        [path],
        bundler,
        deltaBundler,
        config,
        {
          ...options,
          minify: false,
        },
      ),
      transform: await getTransformFn([path], bundler, deltaBundler, config, {
        ...options,
        minify: false,
      }),
      transformOptions: options,
      onProgress: null,
      experimentalImportBundleSupport:
        config.transformer.experimentalImportBundleSupport,
      unstable_allowRequireContext:
        config.transformer.unstable_allowRequireContext,
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
    inlineRequires: transform.inlineRequires || false,
    experimentalImportSupport: transform.experimentalImportSupport || false,
    unstable_disableES6Transforms:
      transform.unstable_disableES6Transforms || false,
    nonInlinedRequires:
      transform.nonInlinedRequires || baseIgnoredInlineRequires,
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

/** Generate the default method for transforming a `require.context` module. */
async function getTransformContextFn(
  entryFiles: $ReadOnlyArray<string>,
  bundler: Bundler,
  deltaBundler: DeltaBundler<>,
  config: ConfigT,
  options: TransformInputOptions,
): Promise<TransformContextFn<>> {
  const {inlineRequires, ...transformOptions} = await calcTransformerOptions(
    entryFiles,
    bundler,
    deltaBundler,
    config,
    options,
  );

  // Cache all of the modules for intermittent updates.
  const moduleCache = {};

  return async (modulePath: string, requireContext: RequireContext) => {
    const graph = await bundler.getDependencyGraph();

    let files = [];
    if (modulePath in moduleCache && requireContext.delta) {
      // Get the cached modules
      files = moduleCache[modulePath];

      // Remove files from the cache.
      const deletedFiles = requireContext.delta.deletedFiles;
      if (deletedFiles.size) {
        files = files.filter(filePath => !deletedFiles.has(filePath));
      }

      // Add files to the cache.
      const addedFiles = requireContext.delta?.addedFiles;
      addedFiles?.forEach(filePath => {
        if (
          !files.includes(filePath) &&
          fileMatchesContext(modulePath, filePath, requireContext)
        ) {
          files.push(filePath);
        }
      });
    } else {
      // Search against all files, this is very expensive.
      // TODO: Maybe we could let the user specify which root to check against.
      files = graph.matchFilesWithContext(modulePath, {
        filter: requireContext.filter,
        recursive: requireContext.recursive,
      });
    }

    moduleCache[modulePath] = files;

    const template = getContextModuleTemplate(
      requireContext.mode,
      modulePath,
      files,
      getContextModuleId(modulePath, requireContext),
    );
    return await bundler.transformFile(
      modulePath,
      {
        ...transformOptions,
        type: getType(
          transformOptions.type,
          modulePath,
          config.resolver.assetExts,
        ),
        inlineRequires: removeInlineRequiresBlockListFromOptions(
          modulePath,
          inlineRequires,
        ),
      },
      Buffer.from(template),
    );
  };
}

async function getTransformFn(
  entryFiles: $ReadOnlyArray<string>,
  bundler: Bundler,
  deltaBundler: DeltaBundler<>,
  config: ConfigT,
  options: TransformInputOptions,
): Promise<TransformFn<>> {
  const {inlineRequires, ...transformOptions} = await calcTransformerOptions(
    entryFiles,
    bundler,
    deltaBundler,
    config,
    options,
  );

  return async (path: string) => {
    return await bundler.transformFile(path, {
      ...transformOptions,
      type: getType(transformOptions.type, path, config.resolver.assetExts),
      inlineRequires: removeInlineRequiresBlockListFromOptions(
        path,
        inlineRequires,
      ),
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
  const dependencyGraph = await await bundler.getDependencyGraph();

  return (from: string, to: string) =>
    // $FlowFixMe[incompatible-call]
    dependencyGraph.resolveDependency(from, to, platform);
}

module.exports = {
  getTransformFn,
  getTransformContextFn,
  getResolveDependencyFn,
};
