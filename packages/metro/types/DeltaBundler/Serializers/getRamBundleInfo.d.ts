/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import {ModuleTransportLike} from '../../shared/types';

export interface RamBundleInfo {
  getDependencies: (filePath: string) => Set<string>;
  startupModules: Readonly<ModuleTransportLike>;
  lazyModules: Readonly<ModuleTransportLike>;
  groups: Map<number, Set<number>>;
}
