/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<0a49d828c4a80d52ccab4d4766b84c86>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/DeltaBundler/Serializers/getAssets.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {AssetData} from '../../Assets';
import type {Module, ReadOnlyDependencies} from '../types';

type Options = {
  readonly processModuleFilter: (module: Module) => boolean;
  assetPlugins: ReadonlyArray<string>;
  platform: null | undefined | string;
  projectRoot: string;
  publicPath: string;
};
declare function getAssets(
  dependencies: ReadOnlyDependencies,
  options: Options,
): Promise<ReadonlyArray<AssetData>>;
export default getAssets;
