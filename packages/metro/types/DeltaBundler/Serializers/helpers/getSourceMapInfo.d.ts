/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {Module} from '../../types';
import type {
  FBSourceFunctionMap,
  MetroSourceMapSegmentTuple,
} from 'metro-source-map';

declare function getSourceMapInfo(
  module: Module,
  options: {
    readonly excludeSource: boolean;
    readonly shouldAddToIgnoreList: ($$PARAM_0$$: Module) => boolean;
    getSourceUrl: null | undefined | ((module: Module) => string);
  },
): {
  readonly map: Array<MetroSourceMapSegmentTuple>;
  readonly functionMap: null | undefined | FBSourceFunctionMap;
  readonly code: string;
  readonly path: string;
  readonly source: string;
  readonly lineCount: number;
  readonly isIgnored: boolean;
};
export default getSourceMapInfo;
