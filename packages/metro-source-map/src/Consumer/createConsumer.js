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

import type {MixedSourceMap} from '../source-map';
import type {IConsumer} from './types.flow';

const invariant = require('invariant');

function createConsumer(sourceMap: MixedSourceMap): IConsumer {
  invariant(
    (sourceMap.version: mixed) === '3' || sourceMap.version === 3,
    `Unrecognized source map format version: ${sourceMap.version}`,
  );
  const MappingsConsumer = require('./MappingsConsumer');
  const SectionsConsumer = require('./SectionsConsumer');

  // eslint-disable-next-line lint/strictly-null
  if (sourceMap.mappings === undefined) {
    return new SectionsConsumer(sourceMap);
  }
  return new MappingsConsumer(sourceMap);
}

module.exports = createConsumer;
