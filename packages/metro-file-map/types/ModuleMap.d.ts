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
  HTypeValue,
  IModuleMap,
  Path,
  ReadOnlyRawModuleMap,
} from './flow-types';

export default class ModuleMap implements IModuleMap {
  getModule(
    name: string,
    platform?: string | null,
    supportsNativePlatform?: boolean | null,
    type?: HTypeValue | null,
  ): Path | null;
  getPackage(
    name: string,
    platform: string | null,
    _supportsNativePlatform?: boolean | null,
  ): Path | null;
  getMockModule(name: string): Path | null;
  getRawModuleMap(): ReadOnlyRawModuleMap;
  static create(rootDir: Path): ModuleMap;
}
