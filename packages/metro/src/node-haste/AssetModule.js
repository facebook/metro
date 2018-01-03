/**
 * Copyright (c) 2015-present, Facebook, Inc.
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

const Module = require('./Module');

import type {TransformedCode} from '../JSTransformer/worker';
import type {ReadResult} from './Module';

class AssetModule extends Module {
  getPackage() {
    return null;
  }

  isHaste() {
    return false;
  }

  isAsset() {
    return true;
  }

  _finalizeReadResult(source: string, result: TransformedCode): ReadResult {
    // We do not want to return the "source code" of assets, since it's going to
    // be binary data and can potentially be very large. This source property
    // is only used to generate the sourcemaps (since we include all the
    // modules original sources in the sourcemaps).
    return {...result, source: ''};
  }
}

module.exports = AssetModule;
