/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {MixedSourceMap} from 'metro-source-map';

declare function relativizeSourceMapInline(
  sourceMap: MixedSourceMap,
  sourcesRoot: string,
): void;
export default relativizeSourceMapInline;
