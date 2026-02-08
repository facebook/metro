/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {DeltaBundle} from 'metro-runtime/src/modules/types';

declare function mergeDeltas(
  delta1: DeltaBundle,
  delta2: DeltaBundle,
): DeltaBundle;
export default mergeDeltas;
