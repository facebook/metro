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

import type HasteFS from './HasteFS';
import type ModuleMap from './ModuleMap';
import type {Stats} from 'graceful-fs';
import type {PerfLogger} from 'metro-config';

export type {PerfLogger};

// These inputs affect the internal data collected for a given filesystem
// state, and changes may invalidate a cache.
export type BuildParameters = $ReadOnly<{
  computeDependencies: boolean,
  computeSha1: boolean,
  enableSymlinks: boolean,
  extensions: $ReadOnlyArray<string>,
  forceNodeFilesystemAPI: boolean,
  ignorePattern: RegExp,
  mocksPattern: ?RegExp,
  platforms: $ReadOnlyArray<string>,
  retainAllFiles: boolean,
  rootDir: string,
  roots: $ReadOnlyArray<string>,
  skipPackageJson: boolean,

  // Module paths that should export a 'getCacheKey' method
  dependencyExtractor: ?string,
  hasteImplModulePath: ?string,

  cacheBreaker: string,
}>;

export interface CacheManager {
  read(): Promise<?InternalData>;
  write(
    dataSnapshot: InternalData,
    delta: $ReadOnly<{changed: FileData, removed: FileData}>,
  ): Promise<void>;
}

export type CacheManagerFactory = (
  buildParameters: BuildParameters,
) => CacheManager;

export type ChangeEvent = {
  eventsQueue: EventsQueue,
  hasteFS: HasteFS,
  moduleMap: ModuleMap,
};

export type Console = typeof global.console;

export type CrawlerOptions = {
  abortSignal: ?AbortSignal,
  computeSha1: boolean,
  enableSymlinks: boolean,
  data: InternalData,
  extensions: $ReadOnlyArray<string>,
  forceNodeFilesystemAPI: boolean,
  ignore: IgnoreMatcher,
  perfLogger?: ?PerfLogger,
  rootDir: string,
  roots: $ReadOnlyArray<string>,
};

export type DuplicatesSet = Map<string, /* type */ number>;
export type DuplicatesIndex = Map<string, Map<string, DuplicatesSet>>;

export type EventsQueue = Array<{
  filePath: Path,
  stat?: ?Stats,
  type: string,
}>;

export type HasteMap = {
  hasteFS: HasteFS,
  moduleMap: ModuleMap,
};

export type HType = {
  ID: 0,
  MTIME: 1,
  SIZE: 2,
  VISITED: 3,
  DEPENDENCIES: 4,
  SHA1: 5,
  PATH: 0,
  TYPE: 1,
  MODULE: 0,
  PACKAGE: 1,
  GENERIC_PLATFORM: 'g',
  NATIVE_PLATFORM: 'native',
  DEPENDENCY_DELIM: '\0',
};

export type HTypeValue = $Values<HType>;

export type IgnoreMatcher = (item: string) => boolean;

export type InternalData = {
  clocks: WatchmanClocks,
  duplicates: DuplicatesIndex,
  files: FileData,
  map: ModuleMapData,
  mocks: MockData,
};

export type FileData = Map<Path, FileMetaData>;

export type FileMetaData = [
  /* id */ string,
  /* mtime */ number,
  /* size */ number,
  /* visited */ 0 | 1,
  /* dependencies */ string,
  /* sha1 */ ?string,
];

export type Glob = string;

export interface IModuleMap<S = SerializableModuleMap> {
  getModule(
    name: string,
    platform?: ?string,
    supportsNativePlatform?: ?boolean,
    type?: ?HTypeValue,
  ): ?Path;

  getPackage(
    name: string,
    platform: ?string,
    _supportsNativePlatform: ?boolean,
  ): ?Path;

  getMockModule(name: string): ?Path;

  getRawModuleMap(): RawModuleMap;

  toJSON(): S;
}

export type MockData = Map<string, Path>;
export type ModuleMapData = Map<string, ModuleMapItem>;

export type ModuleMapItem = {
  [platform: string]: ModuleMetaData,
  __proto__: null,
};
export type ModuleMetaData = [/* path */ string, /* type */ number];

export type Path = string;

export type RawModuleMap = {
  rootDir: Path,
  duplicates: DuplicatesIndex,
  map: ModuleMapData,
  mocks: MockData,
};

export type SerializableModuleMap = {
  duplicates: $ReadOnlyArray<[string, [string, [string, [string, number]]]]>,
  map: $ReadOnlyArray<[string, ModuleMapItem]>,
  mocks: $ReadOnlyArray<[string, Path]>,
  rootDir: Path,
};

export type WatchmanClockSpec =
  | string
  | $ReadOnly<{scm: $ReadOnly<{'mergebase-with': string}>}>;
export type WatchmanClocks = Map<Path, WatchmanClockSpec>;

export type WorkerMessage = $ReadOnly<{
  computeDependencies: boolean,
  computeSha1: boolean,
  dependencyExtractor?: ?string,
  rootDir: string,
  filePath: string,
  hasteImplModulePath?: ?string,
}>;

export type WorkerMetadata = $ReadOnly<{
  dependencies?: ?$ReadOnlyArray<string>,
  id?: ?string,
  module?: ?ModuleMetaData,
  sha1?: ?string,
}>;
