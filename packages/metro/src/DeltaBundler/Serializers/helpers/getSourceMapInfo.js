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

'use strict';

import type {Module} from '../../types.flow';
import type {
  FBSourceFunctionMap,
  MetroSourceMapSegmentTuple,
} from 'metro-source-map';

const {getJsOutput} = require('./js');

function getSourceMapInfo(
  module: Module<>,
  options: {
    +excludeSource: boolean,
  },
): {
  +map: Array<MetroSourceMapSegmentTuple>,
  +functionMap: ?FBSourceFunctionMap,
  +code: string,
  +path: string,
  +source: string,
  +lineCount: number,
} {
  return {
    ...getJsOutput(module).data,
    path: module.path,
    source: options.excludeSource ? '' : getModuleSource(module),
  };
}

function getModuleSource(module: Module<>): string {
  if (getJsOutput(module).type === 'js/module/asset') {
    return '';
  }

  return module.getSource().toString();
}

module.exports = getSourceMapInfo;
