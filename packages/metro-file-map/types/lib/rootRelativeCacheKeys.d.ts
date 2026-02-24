/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<f82cf1eeac38c409c5bf891686c2e828>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/lib/rootRelativeCacheKeys.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {BuildParameters} from '../flow-types';

declare function rootRelativeCacheKeys(buildParameters: BuildParameters): {
  rootDirHash: string;
  relativeConfigHash: string;
};
export default rootRelativeCacheKeys;
