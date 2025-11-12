/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {File} from '@babel/types';
import type {BabelTransformerArgs} from 'metro-babel-transformer';

export declare function transform(
  $$PARAM_0$$: BabelTransformerArgs,
  assetRegistryPath: string,
  assetDataPlugins: ReadonlyArray<string>,
): Promise<{ast: File}>;
