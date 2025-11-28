/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {
  Console,
  DuplicatesSet,
  FileMapDelta,
  FileMapPlugin,
  FileMapPluginInitOptions,
  FileMetadata,
  HasteConflict,
  HasteMap,
  HasteMapItemMetadata,
  HTypeValue,
  Path,
  PerfLogger,
} from '../flow-types';

type HasteMapOptions = Readonly<{
  console?: null | undefined | Console;
  enableHastePackages: boolean;
  perfLogger: null | undefined | PerfLogger;
  platforms: ReadonlySet<string>;
  rootDir: Path;
  failValidationOnConflicts: boolean;
}>;
declare class HastePlugin implements HasteMap, FileMapPlugin<null> {
  readonly name: 'haste';
  constructor(options: HasteMapOptions);
  initialize(initOptions: FileMapPluginInitOptions<null>): Promise<void>;
  getSerializableSnapshot(): null;
  getModule(
    name: string,
    platform?: null | undefined | string,
    supportsNativePlatform?: null | undefined | boolean,
    type?: null | undefined | HTypeValue,
  ): null | undefined | Path;
  getPackage(
    name: string,
    platform: null | undefined | string,
    _supportsNativePlatform?: null | undefined | boolean,
  ): null | undefined | Path;
  /**
   * When looking up a module's data, we walk through each eligible platform for
   * the query. For each platform, we want to check if there are known
   * duplicates for that name+platform pair. The duplication logic normally
   * removes elements from the `map` object, but we want to check upfront to be
   * extra sure. If metadata exists both in the `duplicates` object and the
   * `map`, this would be a bug.
   */
  _getModuleMetadata(
    name: string,
    platform: null | undefined | string,
    supportsNativePlatform: boolean,
  ): HasteMapItemMetadata | null;
  _assertNoDuplicates(
    name: string,
    platform: string,
    supportsNativePlatform: boolean,
    relativePathSet: null | undefined | DuplicatesSet,
  ): void;
  bulkUpdate(delta: FileMapDelta): Promise<void>;
  onNewOrModifiedFile(
    relativeFilePath: string,
    fileMetadata: FileMetadata,
  ): void;
  setModule(id: string, module: HasteMapItemMetadata): void;
  onRemovedFile(relativeFilePath: string, fileMetadata: FileMetadata): void;
  assertValid(): void;
  /**
   * This function should be called when the file under `filePath` is removed
   * or changed. When that happens, we want to figure out if that file was
   * part of a group of files that had the same ID. If it was, we want to
   * remove it from the group. Furthermore, if there is only one file
   * remaining in the group, then we want to restore that single file as the
   * correct resolution for its ID, and cleanup the duplicates index.
   */
  _recoverDuplicates(moduleName: string, relativeFilePath: string): void;
  computeConflicts(): Array<HasteConflict>;
  getCacheKey(): string;
}
export default HastePlugin;
