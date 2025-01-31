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
  Console,
  DuplicatesIndex,
  DuplicatesSet,
  FileMapDelta,
  FileMapPlugin,
  FileMapPluginInitOptions,
  FileMetaData,
  HasteConflict,
  HasteMap,
  HasteMapItem,
  HasteMapItemMetaData,
  HTypeValue,
  Path,
  PerfLogger,
} from '../flow-types';

import H from '../constants';
import {RootPathUtils} from '../lib/RootPathUtils';
import {chainComparators, compareStrings} from '../lib/sorting';
import {DuplicateHasteCandidatesError} from './haste/DuplicateHasteCandidatesError';
import getPlatformExtension from './haste/getPlatformExtension';
import {HasteConflictsError} from './haste/HasteConflictsError';
import path from 'path';

const EMPTY_OBJ: $ReadOnly<{[string]: HasteMapItemMetaData}> = {};
const EMPTY_MAP: $ReadOnlyMap<string, DuplicatesSet> = new Map();

// Periodically yield to the event loop to allow parallel I/O, etc.
// Based on 200k files taking up to 800ms => max 40ms between yields.
const YIELD_EVERY_NUM_HASTE_FILES = 10000;

type HasteMapOptions = $ReadOnly<{
  console?: ?Console,
  enableHastePackages: boolean,
  perfLogger: ?PerfLogger,
  platforms: $ReadOnlySet<string>,
  rootDir: Path,
  failValidationOnConflicts: boolean,
}>;

export default class HastePlugin implements HasteMap, FileMapPlugin<null> {
  +name = 'haste';

  +#rootDir: Path;
  +#map: Map<string, HasteMapItem> = new Map();
  +#duplicates: DuplicatesIndex = new Map();

  +#console: ?Console;
  +#enableHastePackages: boolean;
  +#perfLogger: ?PerfLogger;
  +#pathUtils: RootPathUtils;
  +#platforms: $ReadOnlySet<string>;
  +#failValidationOnConflicts: boolean;
  +#cacheKey: string;

  constructor(options: HasteMapOptions) {
    this.#console = options.console ?? null;
    this.#enableHastePackages = options.enableHastePackages;
    this.#perfLogger = options.perfLogger;
    this.#platforms = options.platforms;
    this.#rootDir = options.rootDir;
    this.#pathUtils = new RootPathUtils(options.rootDir);
    this.#failValidationOnConflicts = options.failValidationOnConflicts;
  }

  async initialize({files}: FileMapPluginInitOptions<null>): Promise<void> {
    this.#perfLogger?.point('constructHasteMap_start');
    let hasteFiles = 0;
    for (const {baseName, canonicalPath, metadata} of files.metadataIterator({
      // Symlinks and node_modules are never Haste modules or packages.
      includeNodeModules: false,
      includeSymlinks: false,
    })) {
      if (metadata[H.ID]) {
        this.setModule(metadata[H.ID], [
          canonicalPath,
          this.#enableHastePackages && baseName === 'package.json'
            ? H.PACKAGE
            : H.MODULE,
        ]);
        if (++hasteFiles % YIELD_EVERY_NUM_HASTE_FILES === 0) {
          await new Promise(setImmediate);
        }
      }
    }
    this.#perfLogger?.point('constructHasteMap_end');
    this.#perfLogger?.annotate({int: {hasteFiles}});
  }

  getSerializableSnapshot(): null {
    // Haste is not serialised, but built from traversing the file metadata
    // on each run. This turns out to have comparable performance to
    // serialisation, at least when Haste is dense, and makes for a much
    // smaller cache.
    return null;
  }

  getModule(
    name: string,
    platform?: ?string,
    supportsNativePlatform?: ?boolean,
    type?: ?HTypeValue,
  ): ?Path {
    const module = this._getModuleMetadata(
      name,
      platform,
      !!supportsNativePlatform,
    );
    if (module && module[H.TYPE] === (type ?? H.MODULE)) {
      const modulePath = module[H.PATH];
      return modulePath && this.#pathUtils.normalToAbsolute(modulePath);
    }
    return null;
  }

  getPackage(
    name: string,
    platform: ?string,
    _supportsNativePlatform?: ?boolean,
  ): ?Path {
    return this.getModule(name, platform, null, H.PACKAGE);
  }

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
    platform: ?string,
    supportsNativePlatform: boolean,
  ): HasteMapItemMetaData | null {
    const map = this.#map.get(name) || EMPTY_OBJ;
    const dupMap = this.#duplicates.get(name) || EMPTY_MAP;
    if (platform != null) {
      this._assertNoDuplicates(
        name,
        platform,
        supportsNativePlatform,
        dupMap.get(platform),
      );
      if (map[platform] != null) {
        return map[platform];
      }
    }
    if (supportsNativePlatform) {
      this._assertNoDuplicates(
        name,
        H.NATIVE_PLATFORM,
        supportsNativePlatform,
        dupMap.get(H.NATIVE_PLATFORM),
      );
      if (map[H.NATIVE_PLATFORM]) {
        return map[H.NATIVE_PLATFORM];
      }
    }
    this._assertNoDuplicates(
      name,
      H.GENERIC_PLATFORM,
      supportsNativePlatform,
      dupMap.get(H.GENERIC_PLATFORM),
    );
    if (map[H.GENERIC_PLATFORM]) {
      return map[H.GENERIC_PLATFORM];
    }
    return null;
  }

  _assertNoDuplicates(
    name: string,
    platform: string,
    supportsNativePlatform: boolean,
    relativePathSet: ?DuplicatesSet,
  ): void {
    if (relativePathSet == null) {
      return;
    }
    const duplicates = new Map<string, number>();

    for (const [relativePath, type] of relativePathSet) {
      const duplicatePath = this.#pathUtils.normalToAbsolute(relativePath);
      duplicates.set(duplicatePath, type);
    }

    throw new DuplicateHasteCandidatesError(
      name,
      platform,
      supportsNativePlatform,
      duplicates,
    );
  }

  async bulkUpdate(delta: FileMapDelta): Promise<void> {
    // Process removals first so that moves aren't treated as duplicates.
    for (const [normalPath, metadata] of delta.removed) {
      this.onRemovedFile(normalPath, metadata);
    }
    for (const [normalPath, metadata] of delta.addedOrModified) {
      this.onNewOrModifiedFile(normalPath, metadata);
    }
  }

  onNewOrModifiedFile(relativeFilePath: string, fileMetadata: FileMetaData) {
    const id = fileMetadata[H.ID] || null; // Empty string indicates no module
    if (id == null) {
      return;
    }

    const module = [
      relativeFilePath,
      this.#enableHastePackages &&
      path.basename(relativeFilePath) === 'package.json'
        ? H.PACKAGE
        : H.MODULE,
    ];

    this.setModule(id, module);
  }

  setModule(id: string, module: HasteMapItemMetaData) {
    let hasteMapItem = this.#map.get(id);
    if (!hasteMapItem) {
      // $FlowFixMe[unclear-type] - Add type coverage
      hasteMapItem = (Object.create(null): any);
      this.#map.set(id, hasteMapItem);
    }
    const platform =
      getPlatformExtension(module[H.PATH], this.#platforms) ||
      H.GENERIC_PLATFORM;

    const existingModule = hasteMapItem[platform];

    if (existingModule && existingModule[H.PATH] !== module[H.PATH]) {
      if (this.#console) {
        this.#console.warn(
          [
            'metro-file-map: Haste module naming collision: ' + id,
            '  The following files share their name; please adjust your hasteImpl:',
            '    * <rootDir>' + path.sep + existingModule[H.PATH],
            '    * <rootDir>' + path.sep + module[H.PATH],
            '',
          ].join('\n'),
        );
      }

      // We do NOT want consumers to use a module that is ambiguous.
      delete hasteMapItem[platform];

      if (Object.keys(hasteMapItem).length === 0) {
        this.#map.delete(id);
      }

      let dupsByPlatform = this.#duplicates.get(id);
      if (dupsByPlatform == null) {
        dupsByPlatform = new Map();
        this.#duplicates.set(id, dupsByPlatform);
      }

      const dups = new Map([
        [module[H.PATH], module[H.TYPE]],
        [existingModule[H.PATH], existingModule[H.TYPE]],
      ]);
      dupsByPlatform.set(platform, dups);

      return;
    }

    const dupsByPlatform = this.#duplicates.get(id);
    if (dupsByPlatform != null) {
      const dups = dupsByPlatform.get(platform);
      if (dups != null) {
        dups.set(module[H.PATH], module[H.TYPE]);
      }
      return;
    }

    hasteMapItem[platform] = module;
  }

  onRemovedFile(relativeFilePath: string, fileMetadata: FileMetaData) {
    const moduleName = fileMetadata[H.ID] || null; // Empty string indicates no module
    if (moduleName == null) {
      return;
    }

    const platform =
      getPlatformExtension(relativeFilePath, this.#platforms) ||
      H.GENERIC_PLATFORM;

    const hasteMapItem = this.#map.get(moduleName);
    if (hasteMapItem != null) {
      delete hasteMapItem[platform];
      if (Object.keys(hasteMapItem).length === 0) {
        this.#map.delete(moduleName);
      } else {
        this.#map.set(moduleName, hasteMapItem);
      }
    }

    this._recoverDuplicates(moduleName, relativeFilePath);
  }

  assertValid(): void {
    if (!this.#failValidationOnConflicts) {
      return;
    }
    const conflicts = this.computeConflicts();
    if (conflicts.length > 0) {
      throw new HasteConflictsError(conflicts);
    }
  }

  /**
   * This function should be called when the file under `filePath` is removed
   * or changed. When that happens, we want to figure out if that file was
   * part of a group of files that had the same ID. If it was, we want to
   * remove it from the group. Furthermore, if there is only one file
   * remaining in the group, then we want to restore that single file as the
   * correct resolution for its ID, and cleanup the duplicates index.
   */
  _recoverDuplicates(moduleName: string, relativeFilePath: string) {
    let dupsByPlatform = this.#duplicates.get(moduleName);
    if (dupsByPlatform == null) {
      return;
    }

    const platform =
      getPlatformExtension(relativeFilePath, this.#platforms) ||
      H.GENERIC_PLATFORM;
    let dups = dupsByPlatform.get(platform);
    if (dups == null) {
      return;
    }

    dupsByPlatform = new Map(dupsByPlatform);
    this.#duplicates.set(moduleName, dupsByPlatform);

    dups = new Map(dups);
    dupsByPlatform.set(platform, dups);
    dups.delete(relativeFilePath);

    if (dups.size !== 1) {
      return;
    }

    const uniqueModule = dups.entries().next().value;

    if (!uniqueModule) {
      return;
    }

    let dedupMap: ?HasteMapItem = this.#map.get(moduleName);

    if (dedupMap == null) {
      dedupMap = (Object.create(null): HasteMapItem);
      this.#map.set(moduleName, dedupMap);
    }
    dedupMap[platform] = uniqueModule;
    dupsByPlatform.delete(platform);
    if (dupsByPlatform.size === 0) {
      this.#duplicates.delete(moduleName);
    }
  }

  computeConflicts(): Array<HasteConflict> {
    const conflicts: Array<HasteConflict> = [];

    // Add literal duplicates tracked in the #duplicates map
    for (const [id, dupsByPlatform] of this.#duplicates.entries()) {
      for (const [platform, conflictingModules] of dupsByPlatform) {
        conflicts.push({
          id,
          platform: platform === H.GENERIC_PLATFORM ? null : platform,
          absolutePaths: [...conflictingModules.keys()]
            .map(modulePath => this.#pathUtils.normalToAbsolute(modulePath))
            // Sort for ease of testing
            .sort(),
          type: 'duplicate',
        });
      }
    }

    // Add cases of "shadowing at a distance": a module with a platform suffix and
    // a module with a lower priority platform suffix (or no suffix), in different
    // directories.
    for (const [id, data] of this.#map) {
      const conflictPaths = new Set<string>();
      const basePaths = [];
      for (const basePlatform of [H.NATIVE_PLATFORM, H.GENERIC_PLATFORM]) {
        if (data[basePlatform] == null) {
          continue;
        }
        const basePath = data[basePlatform][0];
        basePaths.push(basePath);
        const basePathDir = path.dirname(basePath);
        // Find all platforms that can shadow basePlatform
        // Given that X.(specific platform).js > x.native.js > X.js
        // and basePlatform is either 'native' or generic (no platform).
        for (const platform of Object.keys(data)) {
          if (
            platform === basePlatform ||
            platform === H.GENERIC_PLATFORM /* lowest priority */
          ) {
            continue;
          }
          const platformPath = data[platform][0];
          if (path.dirname(platformPath) !== basePathDir) {
            conflictPaths.add(platformPath);
          }
        }
      }
      if (conflictPaths.size) {
        conflicts.push({
          id,
          platform: null,
          absolutePaths: [...new Set([...conflictPaths, ...basePaths])]
            .map(modulePath => this.#pathUtils.normalToAbsolute(modulePath))
            // Sort for ease of testing
            .sort(),
          type: 'shadowing',
        });
      }
    }

    // Sort for ease of testing
    conflicts.sort(
      chainComparators(
        (a, b) => compareStrings(a.type, b.type),
        (a, b) => compareStrings(a.id, b.id),
        (a, b) => compareStrings(a.platform, b.platform),
      ),
    );

    return conflicts;
  }
}
