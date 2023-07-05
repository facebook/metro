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
  HTypeValue,
  HasteMap,
  HasteMapItem,
  HasteMapItemMetaData,
  Path,
  RawHasteMap,
  ReadOnlyRawHasteMap,
} from '../flow-types';

import H from '../constants';
import {DuplicateError} from './DuplicateError';
import {DuplicateHasteCandidatesError} from './DuplicateHasteCandidatesError';
import * as fastPath from './fast_path';
import getPlatformExtension from './getPlatformExtension';
import path from 'path';

const EMPTY_OBJ: $ReadOnly<{[string]: HasteMapItemMetaData}> = {};
const EMPTY_MAP: $ReadOnlyMap<string, DuplicatesSet> = new Map();

type HasteMapOptions = $ReadOnly<{
  console?: ?Console,
  platforms: $ReadOnlySet<string>,
  rootDir: Path,
  throwOnModuleCollision: boolean,
}>;

export default class MutableHasteMap implements HasteMap {
  +#rootDir: Path;
  #map: Map<string, HasteMapItem> = new Map();
  #duplicates: DuplicatesIndex = new Map();

  +#console: ?Console;
  #throwOnModuleCollision: boolean;
  +#platforms: $ReadOnlySet<string>;

  constructor(options: HasteMapOptions) {
    this.#console = options.console ?? null;
    this.#platforms = options.platforms;
    this.#rootDir = options.rootDir;
    this.#throwOnModuleCollision = options.throwOnModuleCollision;
  }

  static fromDeserializedSnapshot(
    deserializedData: RawHasteMap,
    options: HasteMapOptions,
  ): MutableHasteMap {
    const hasteMap = new MutableHasteMap(options);
    hasteMap.#map = deserializedData.map;
    hasteMap.#duplicates = deserializedData.duplicates;
    return hasteMap;
  }

  getSerializableSnapshot(): RawHasteMap {
    const mapMap = <K, V1, V2>(
      map: $ReadOnlyMap<K, V1>,
      mapFn: (v: V1) => V2,
    ): Map<K, V2> => {
      return new Map(
        Array.from(map.entries(), ([key, val]): [K, V2] => [key, mapFn(val)]),
      );
    };

    return {
      duplicates: mapMap(this.#duplicates, v =>
        mapMap(v, v2 => new Map(v2.entries())),
      ),
      map: mapMap(this.#map, v =>
        Object.assign(
          Object.create(null),
          Object.fromEntries(
            Array.from(Object.entries(v), ([key, val]) => [key, [...val]]),
          ),
        ),
      ),
    };
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
      return modulePath && fastPath.resolve(this.#rootDir, modulePath);
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

  // FIXME: This is only used by Meta-internal validation and should be
  // removed or replaced with a less leaky API.
  getRawHasteMap(): ReadOnlyRawHasteMap {
    return {
      duplicates: this.#duplicates,
      map: this.#map,
    };
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
      const duplicatePath = fastPath.resolve(this.#rootDir, relativePath);
      duplicates.set(duplicatePath, type);
    }

    throw new DuplicateHasteCandidatesError(
      name,
      platform,
      supportsNativePlatform,
      duplicates,
    );
  }

  setModule(id: string, module: HasteMapItemMetaData): void {
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
        const method = this.#throwOnModuleCollision ? 'error' : 'warn';

        this.#console[method](
          [
            'metro-file-map: Haste module naming collision: ' + id,
            '  The following files share their name; please adjust your hasteImpl:',
            '    * <rootDir>' + path.sep + existingModule[H.PATH],
            '    * <rootDir>' + path.sep + module[H.PATH],
            '',
          ].join('\n'),
        );
      }

      if (this.#throwOnModuleCollision) {
        throw new DuplicateError(existingModule[H.PATH], module[H.PATH]);
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

  removeModule(moduleName: string, relativeFilePath: string) {
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

  setThrowOnModuleCollision(shouldThrow: boolean) {
    this.#throwOnModuleCollision = shouldThrow;
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
}
