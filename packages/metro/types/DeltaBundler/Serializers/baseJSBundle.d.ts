/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
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
