/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 * @emails oncall+js_foundation
 */

'use strict';

const AssetModule = require('../AssetModule');

describe('AssetModule:', () => {
  const defaults = {file: '/arbitrary.png'};

  it('is an asset', () => {
    expect(new AssetModule(defaults).isAsset()).toBe(true);
  });
});
