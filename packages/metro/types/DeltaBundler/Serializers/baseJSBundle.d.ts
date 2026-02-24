/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<e21aeb433f191f32b37d05733b0b76bd>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/DeltaBundler/Serializers/baseJSBundle.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {Module, ReadOnlyGraph, SerializerOptions} from '../types';
import type {Bundle} from 'metro-runtime/src/modules/types';

declare function baseJSBundle(
  entryPoint: string,
  preModules: ReadonlyArray<Module>,
  graph: ReadOnlyGraph,
  options: SerializerOptions,
): Bundle;
export default baseJSBundle;
