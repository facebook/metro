/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<cc4f3dbaa30a0fb78500bbf7d032c711>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-transform-worker/src/utils/assetTransformer.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {File} from '@babel/types';
import type {BabelTransformerArgs} from 'metro-babel-transformer';

export declare function transform(
  $$PARAM_0$$: BabelTransformerArgs,
  assetRegistryPath: string,
  assetDataPlugins: ReadonlyArray<string>,
  urlPath?: string,
): Promise<{ast: File}>;
