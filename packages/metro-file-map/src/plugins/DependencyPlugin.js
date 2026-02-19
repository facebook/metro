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

import type {
  FileMapDelta,
  FileMapPlugin,
  FileMapPluginInitOptions,
  FileMapPluginWorker,
  Path,
} from '../flow-types';

export type DependencyPluginOptions = Readonly<{
  /** Path to custom dependency extractor module */
  dependencyExtractor: ?string,
  /** Whether to compute dependencies (performance optimization) */
  computeDependencies: boolean,
  rootDir: Path,
}>;

export default class DependencyPlugin
  implements FileMapPlugin<null, ReadonlyArray<string> | null>
{
  +name: 'dependencies' = 'dependencies';

  #dependencyExtractor: ?string;
  #computeDependencies: boolean;
  #getDependencies: Path => ?ReadonlyArray<string>;
  #rootDir: Path;

  constructor(options: DependencyPluginOptions) {
    this.#dependencyExtractor = options.dependencyExtractor;
    this.#computeDependencies = options.computeDependencies;
    this.#rootDir = options.rootDir;
  }

  async initialize(
    initOptions: FileMapPluginInitOptions<null, ReadonlyArray<string> | null>,
  ): Promise<void> {
    const {files} = initOptions;
    // Create closure to access dependencies from file metadata plugin data
    this.#getDependencies = (mixedPath: Path) => {
      const result = files.lookup(mixedPath);
      if (result.exists && result.type === 'f') {
        // Backwards compatibility: distinguish an extant file that we've not
        // run the worker on (probably because it fails the extension filter)
        // from a missing file. Non-source files are expected to have empty
        // dependencies.
        return result.pluginData ?? [];
      }
      return null;
    };
  }

  getSerializableSnapshot(): null {
    // Dependencies stored in plugin data, no separate serialization needed
    return null;
  }

  async bulkUpdate(delta: FileMapDelta<?ReadonlyArray<string>>): Promise<void> {
    // No-op: Worker already populated plugin data
    // Plugin data is write-only from worker
  }

  onNewOrModifiedFile(
    relativeFilePath: string,
    pluginData: ?ReadonlyArray<string>,
  ): void {
    // No-op: Dependencies already in plugin data
  }

  onRemovedFile(
    relativeFilePath: string,
    pluginData: ?ReadonlyArray<string>,
  ): void {
    // No-op
  }

  assertValid(): void {
    // No validation needed
  }

  getCacheKey(): string {
    if (this.#dependencyExtractor != null) {
      // Dynamic require to get extractor's cache key
      // $FlowFixMe[unsupported-syntax] - dynamic require
      const extractor = require(this.#dependencyExtractor);
      return JSON.stringify({
        extractorKey: extractor.getCacheKey?.() ?? null,
        extractorPath: this.#dependencyExtractor,
      });
    }
    return 'default-dependency-extractor';
  }

  getWorker(): FileMapPluginWorker {
    const excludedExtensions = require('../workerExclusionList');

    return {
      worker: {
        modulePath: require.resolve('./dependencies/worker.js'),
        setupArgs: {
          dependencyExtractor: this.#dependencyExtractor ?? null,
        },
      },
      filter: ({normalPath, isNodeModules}) => {
        // Respect computeDependencies flag
        if (!this.#computeDependencies) {
          return false;
        }

        // Never process node_modules
        if (isNodeModules) {
          return false;
        }

        // Skip excluded extensions
        const ext = normalPath.substr(normalPath.lastIndexOf('.'));
        return !excludedExtensions.has(ext);
      },
    };
  }

  /**
   * Get the list of dependencies for a given file.
   * @param mixedPath Absolute or project-relative path to the file
   * @returns Array of dependency module names, or null if the file doesn't exist
   */
  getDependencies(mixedPath: Path): ?ReadonlyArray<string> {
    if (this.#getDependencies == null) {
      throw new Error(
        'DependencyPlugin has not been initialized before getDependencies',
      );
    }
    return this.#getDependencies(mixedPath);
  }
}
