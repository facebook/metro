/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 */

'use strict';

import type EventEmitter from 'events';

// TODO(cpojer): Create a jest-types repo.
export type HasteFS = {
  exists(filePath: string): boolean,
  getAllFiles(): Array<string>,
  getDependencies(filePath: string): Array<string>,
  getFileIterator(): Iterator<string>,
  getModuleName(filePath: string): ?string,
  getSha1(string): ?string,
  matchFiles(pattern: RegExp | string): Array<string>,
  ...
};

export type HasteConfig = $ReadOnly<{
  cacheDirectory?: ?string,
  computeDependencies?: ?boolean,
  computeSha1?: ?boolean,
  dependencyExtractor?: ?string | null,
  enableSymlinks?: ?boolean,
  extensions: $ReadOnlyArray<string>,
  forceNodeFilesystemAPI?: ?boolean,
  hasteImplModulePath?: ?string,
  hasteMapModulePath?: ?string,
  ignorePattern?: ?RegExp | ((str: string) => boolean),
  maxWorkers: number,
  mocksPattern?: ?string,
  name: string,
  platforms: $ReadOnlyArray<string>,
  resetCache?: ?boolean,
  retainAllFiles: boolean,
  rootDir: string,
  roots: $ReadOnlyArray<string>,
  skipPackageJson?: ?boolean,
  throwOnModuleCollision?: ?boolean,
  useWatchman?: ?boolean,
  watch?: ?boolean,
  ...
}>;

type ModuleMapItem = {[platform: string]: ModuleMetaData};
type ModuleMetaData = [string, number];
type MockData = Map<string, string>;
type ModuleMapData = Map<string, ModuleMapItem>;
type DuplicatesSet = Map<string, number>;
type DuplicatesIndex = Map<string, Map<string, DuplicatesSet>>;

type RawModuleMap = {
  rootDir: string,
  duplicates: DuplicatesIndex,
  map: ModuleMapData,
  mocks: MockData,
};

// `jest-haste-map`'s interface for ModuleMap.
export type ModuleMap = {
  getModule(
    name: string,
    platform: string | null,
    supportsNativePlatform: ?boolean,
  ): ?string,
  getPackage(
    name: string,
    platform: string | null,
    supportsNativePlatform: ?boolean,
  ): ?string,
  getRawModuleMap(): RawModuleMap,
  ...
};

// Interface as used by node-haste / internal tools, satisfied by JestHasteMap
export interface HasteMap extends EventEmitter {
  build: () => Promise<{hasteFS: HasteFS, moduleMap: ModuleMap}>;
  end: () => void;
  getCacheFilePath: () => string;
}
