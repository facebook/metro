/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<17776d35467f02c7e07dcde4be309545>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/node-haste/Package.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {PackageJson} from 'metro-resolver/private/types';

declare class Package {
  path: string;
  _root: string;
  _content: null | undefined | PackageJson;
  constructor($$PARAM_0$$: {file: string});
  invalidate(): void;
  read(): PackageJson;
}
export default Package;
