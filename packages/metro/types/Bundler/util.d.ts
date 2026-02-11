/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
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
