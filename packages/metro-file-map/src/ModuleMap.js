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
  DuplicatesSet,
  HTypeValue,
  IModuleMap,
  ModuleMetaData,
  Path,
  RawModuleMap,
  ReadOnlyRawModuleMap,
} from './flow-types';

import H from './constants';
import {DuplicateHasteCandidatesError} from './lib/DuplicateHasteCandidatesError';
import * as fastPath from './lib/fast_path';

const EMPTY_OBJ: {[string]: ModuleMetaData} = {};
const EMPTY_MAP = new Map<'g' | 'native' | string, ?DuplicatesSet>();

export default class ModuleMap implements IModuleMap {
  +#raw: RawModuleMap;

  constructor(raw: RawModuleMap) {
    // $FlowIssue[cannot-write] - should be fixed in Flow 0.193 (D41130671)
    this.#raw = raw;
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
      return modulePath && fastPath.resolve(this.#raw.rootDir, modulePath);
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

  getMockModule(name: string): ?Path {
    const mockPath =
      this.#raw.mocks.get(name) || this.#raw.mocks.get(name + '/index');
    return mockPath != null
      ? fastPath.resolve(this.#raw.rootDir, mockPath)
      : null;
  }

  // FIXME: This is only used by Meta-internal validation and should be
  // removed or replaced with a less leaky API.
  getRawModuleMap(): ReadOnlyRawModuleMap {
    return {
      duplicates: this.#raw.duplicates,
      map: this.#raw.map,
      mocks: this.#raw.mocks,
      rootDir: this.#raw.rootDir,
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
  ): ModuleMetaData | null {
    const map = this.#raw.map.get(name) || EMPTY_OBJ;
    const dupMap = this.#raw.duplicates.get(name) || EMPTY_MAP;
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
      const duplicatePath = fastPath.resolve(this.#raw.rootDir, relativePath);
      duplicates.set(duplicatePath, type);
    }

    throw new DuplicateHasteCandidatesError(
      name,
      platform,
      supportsNativePlatform,
      duplicates,
    );
  }

  static create(rootDir: Path): ModuleMap {
    return new ModuleMap({
      duplicates: new Map(),
      map: new Map(),
      mocks: new Map(),
      rootDir,
    });
  }
}
