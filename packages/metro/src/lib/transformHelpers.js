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
import type {TransformFn} from '../DeltaBundler/traverseDependencies';
import type DeltaBundler from '../DeltaBundler';
import type {TransformOptions} from '../JSTransformer/worker';
import type {BuildGraphOptions} from '../Server';

type InlineRequiresRaw = {+blacklist: {[string]: true}} | boolean;

async function calcTransformerOptions(
  entryFiles: $ReadOnlyArray<string>,
  bundler: Bundler,
  deltaBundler: DeltaBundler,
  options: BuildGraphOptions,
): Promise<{...TransformOptions, inlineRequires: InlineRequiresRaw}> {
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
  deltaBundler: DeltaBundler,
  options: BuildGraphOptions,
): Promise<TransformFn> {
  const dependencyGraph = await bundler.getDependencyGraph();
  const {inlineRequires, ...transformerOptions} = await calcTransformerOptions(
    entryFiles,
    bundler,
    deltaBundler,
    options,
  );

  return async (path: string) => {
    const module = dependencyGraph.getModuleForPath(
      path,
      options.type === 'script',
    );
    const result = await module.read({
      ...transformerOptions,
      inlineRequires: removeInlineRequiresBlacklistFromOptions(
        path,
        inlineRequires,
      ),
    });

    return {
      getSource() {
        return result.source;
      },
      output: [
        {
          data: {
            code: result.code,
            map: result.map,
          },
          type: result.type,
        },
      ],
      dependencies: result.dependencies,
    };
  };
}

async function getResolveDependencyFn(
  bundler: Bundler,
  platform: ?string,
): Promise<(from: string, to: string) => string> {
  const dependencyGraph = await bundler.getDependencyGraph();

  return (from: string, to: string) => {
    return dependencyGraph.resolveDependency(
      dependencyGraph.getModuleForPath(from, false),
      to,
      platform,
    ).path;
  };
}

module.exports = {
  calcTransformerOptions,
  getTransformFn,
  getResolveDependencyFn,
};
