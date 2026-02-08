/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {ReadOnlyGraph} from '../../types';

declare function getTransitiveDependencies<T>(
  path: string,
  graph: ReadOnlyGraph<T>,
): Set<string>;
export default getTransitiveDependencies;
