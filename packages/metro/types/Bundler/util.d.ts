/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<adf0e819f93597b57ff231cca9c918ef>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/Bundler/util.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {AssetDataWithoutFiles} from '../Assets';
import type {ModuleTransportLike} from '../shared/types';
import type {File} from '@babel/types';

type SubTree<T extends ModuleTransportLike> = (
  moduleTransport: T,
  moduleTransportsByPath: Map<string, T>,
) => Iterable<number>;
export declare function generateAssetCodeFileAst(
  assetRegistryPath: string,
  assetDescriptor: AssetDataWithoutFiles,
): File;
export declare function createRamBundleGroups<T extends ModuleTransportLike>(
  ramGroups: ReadonlyArray<string>,
  groupableModules: ReadonlyArray<T>,
  subtree: SubTree<T>,
): Map<number, Set<number>>;
