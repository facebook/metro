/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const Module = require('./Module');

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

  _readSourceCode() {
    // We do not want to return the "source code" of assets, since it's going to
    // be binary data and can potentially be very large. This source property
    // is only used to generate the sourcemaps (since we include all the
    // modules original sources in the sourcemaps).
    return '';
  }
}

module.exports = AssetModule;
