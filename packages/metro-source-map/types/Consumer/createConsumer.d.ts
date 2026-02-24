/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<3628df6a457f3d3d7c15f9e248338e4e>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-source-map/src/Consumer/createConsumer.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {MixedSourceMap} from '../source-map';
import type {IConsumer} from './types';

declare function createConsumer(sourceMap: MixedSourceMap): IConsumer;
export default createConsumer;
