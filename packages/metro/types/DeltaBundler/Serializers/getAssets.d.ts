/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
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
