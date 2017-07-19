/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @format
 */

'use strict';

import type {Ast, SourceMap as MappingsMap} from 'babel-core';

export type IntermediateTransformResult = {
  ast: ?Ast,
  code: ?string,
  map: ?MappingsMap,
};
