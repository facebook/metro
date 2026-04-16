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

import type {Path} from '../flow-types';

import excludedExtensions from '../workerExclusionList';
import FileDataPlugin from './FileDataPlugin';

export type DependencyPluginOptions = Readonly<{
  /** Path to custom dependency extractor module */
  dependencyExtractor: ?string,
  /** Whether to compute dependencies (performance optimization) */
  computeDependencies: boolean,
}>;

export default class DependencyPlugin extends FileDataPlugin<ReadonlyArray<string> | null> {
  constructor(options: DependencyPluginOptions) {
    const {dependencyExtractor, computeDependencies} = options;

    let cacheKey: string;
    if (dependencyExtractor != null) {
      // $FlowFixMe[unsupported-syntax] - dynamic require
      const extractor = require(dependencyExtractor);
      cacheKey = extractor.getCacheKey?.() ?? dependencyExtractor;
    } else {
      cacheKey = 'default-dependency-extractor';
    }

    super({
      name: 'dependencies',
      cacheKey,
      worker: {
        modulePath: require.resolve('./dependencies/worker.js'),
        setupArgs: {
          dependencyExtractor: dependencyExtractor ?? null,
        },
      },
      filter: ({normalPath, isNodeModules}) => {
        if (!computeDependencies) {
          return false;
        }
        if (isNodeModules) {
          return false;
        }
        const ext = normalPath.substr(normalPath.lastIndexOf('.'));
        return !excludedExtensions.has(ext);
      },
    });
  }

  getDependencies(mixedPath: Path): ?ReadonlyArray<string> {
    const result = this.getFileSystem().lookup(mixedPath);
    if (result.exists && result.type === 'f') {
      return result.pluginData ?? [];
    }
    return null;
  }
}
