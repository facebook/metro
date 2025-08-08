/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import type {Module} from '../../types';
import type {
  FBSourceFunctionMap,
  MetroSourceMapSegmentTuple,
} from 'metro-source-map';

import {getJsOutput} from './js';

export default function getSourceMapInfo(
  module: Module<>,
  options: {
    +excludeSource: boolean,
    +shouldAddToIgnoreList: (Module<>) => boolean,
    getSourceUrl: ?(module: Module<>) => string,
  },
): {
  +map: Array<MetroSourceMapSegmentTuple>,
  +functionMap: ?FBSourceFunctionMap,
  +code: string,
  +path: string,
  +source: string,
  +lineCount: number,
  +isIgnored: boolean,
} {
  return {
    ...getJsOutput(module).data,
    isIgnored: options.shouldAddToIgnoreList(module),
    path: options?.getSourceUrl?.(module) ?? module.path,
    source: options.excludeSource ? '' : getModuleSource(module),
  };
}

function getModuleSource(module: Module<>): string {
  if (getJsOutput(module).type === 'js/module/asset') {
    return '';
  }

  return module.getSource().toString();
}
