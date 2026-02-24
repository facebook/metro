/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<c008adad2ea747972e2f301a6375b447>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/node-haste/DependencyGraph/createFileMap.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {ConfigT} from 'metro-config';
import type {HasteMap} from 'metro-file-map';

import MetroFileMap, {DependencyPlugin} from 'metro-file-map';

declare function createFileMap(
  config: ConfigT,
  options?: Readonly<{
    extractDependencies?: boolean;
    watch?: boolean;
    throwOnModuleCollision?: boolean;
    cacheFilePrefix?: string;
  }>,
): {
  fileMap: MetroFileMap;
  hasteMap: HasteMap;
  dependencyPlugin: null | undefined | DependencyPlugin;
};
export default createFileMap;
