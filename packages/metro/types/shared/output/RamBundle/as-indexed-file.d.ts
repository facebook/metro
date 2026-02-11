/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {RamBundleInfo} from '../../../DeltaBundler/Serializers/getRamBundleInfo';
import type {
  ModuleGroups,
  ModuleTransportLike,
  OutputOptions,
} from '../../types';
/**
 * Saves all JS modules of an app as a single file, separated with null bytes.
 * The file begins with an offset table that contains module ids and their
 * lengths/offsets.
 * The module id for the startup code (prelude, polyfills etc.) is the
 * empty string.
 */
export declare function save(
  bundle: RamBundleInfo,
  options: OutputOptions,
  log: (...args: Array<string>) => void,
): Promise<unknown>;
export declare function buildTableAndContents(
  startupCode: string,
  modules: ReadonlyArray<ModuleTransportLike>,
  moduleGroups: ModuleGroups,
  encoding?: 'utf8' | 'utf16le' | 'ascii',
): Array<Buffer>;
export declare function createModuleGroups(
  groups: Map<number, Set<number>>,
  modules: ReadonlyArray<ModuleTransportLike>,
): ModuleGroups;
