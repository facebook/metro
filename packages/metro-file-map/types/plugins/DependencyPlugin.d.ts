/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<71361b3fd04f54f55665031c66465dd7>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/plugins/DependencyPlugin.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
  dependencyExtractor: null | undefined | string;
  /** Whether to compute dependencies (performance optimization) */
  computeDependencies: boolean;
  rootDir: Path;
}>;
declare class DependencyPlugin
  implements FileMapPlugin<null, ReadonlyArray<string> | null>
{
  readonly name: 'dependencies';
  constructor(options: DependencyPluginOptions);
  initialize(
    initOptions: FileMapPluginInitOptions<null, ReadonlyArray<string> | null>,
  ): Promise<void>;
  getSerializableSnapshot(): null;
  bulkUpdate(
    delta: FileMapDelta<null | undefined | ReadonlyArray<string>>,
  ): void;
  onNewOrModifiedFile(
    relativeFilePath: string,
    pluginData: null | undefined | ReadonlyArray<string>,
  ): void;
  onRemovedFile(
    relativeFilePath: string,
    pluginData: null | undefined | ReadonlyArray<string>,
  ): void;
  assertValid(): void;
  getCacheKey(): string;
  getWorker(): FileMapPluginWorker;
  /**
   * Get the list of dependencies for a given file.
   * @param mixedPath Absolute or project-relative path to the file
   * @returns Array of dependency module names, or null if the file doesn't exist
   */
  getDependencies(mixedPath: Path): null | undefined | ReadonlyArray<string>;
}
export default DependencyPlugin;
