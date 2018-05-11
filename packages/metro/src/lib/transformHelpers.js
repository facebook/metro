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

import type Bundler from '../Bundler';
import type DeltaBundler, {TransformFn} from '../DeltaBundler';
import type {WorkerOptions} from '../JSTransformer/worker';
import type {BuildGraphOptions} from '../Server';

type InlineRequiresRaw = {+blacklist: {[string]: true}} | boolean;

async function calcTransformerOptions(
  entryFiles: $ReadOnlyArray<string>,
  bundler: Bundler,
  deltaBundler: DeltaBundler<>,
  options: BuildGraphOptions,
): Promise<{...WorkerOptions, inlineRequires: InlineRequiresRaw}> {
  const {
    enableBabelRCLookup,
    projectRoot,
  } = bundler.getGlobalTransformOptions();

  const transformOptionsForBlacklist = {
    assetDataPlugins: options.assetPlugins,
    customTransformOptions: options.customTransformOptions,
    enableBabelRCLookup,
    dev: options.dev,
    hot: options.hot,
    inlineRequires: false,
    isScript: options.type === 'script',
    minify: options.minify,
    platform: options.platform,
    projectRoot,
  };

  // When we're processing scripts, we don't need to calculate any
  // inlineRequires information, since scripts by definition don't have
  // requires().
  if (options.type === 'script') {
    return {
      ...transformOptionsForBlacklist,
      inlineRequires: false,
    };
  }

  const {inlineRequires} = await bundler.getTransformOptionsForEntryFiles(
    entryFiles,
    {dev: options.dev, platform: options.platform},
    async path => {
      const {dependencies} = await deltaBundler.buildGraph([path], {
        resolve: await getResolveDependencyFn(bundler, options.platform),
        transform: await getTransformFn([path], bundler, deltaBundler, options),
        onProgress: null,
      });

      return Array.from(dependencies.keys());
    },
  );

  return {
    ...transformOptionsForBlacklist,
    inlineRequires: inlineRequires || false,
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
  options: BuildGraphOptions,
): Promise<TransformFn<>> {
  const {inlineRequires, ...transformerOptions} = await calcTransformerOptions(
    entryFiles,
    bundler,
    deltaBundler,
    options,
  );

  return async (path: string) => {
    return await bundler.transformFile(path, {
      ...transformerOptions,
      inlineRequires: removeInlineRequiresBlacklistFromOptions(
        path,
        inlineRequires,
      ),
    });
  };
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
  calcTransformerOptions,
  getTransformFn,
  getResolveDependencyFn,
};
