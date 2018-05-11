/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+js_foundation
 */

'use strict';

const AssetModule = require('../AssetModule');

describe('AssetModule:', () => {
  it('is an asset', () => {
    expect(new AssetModule({file: '/arbitrary.png'}).isAsset()).toBe(true);
  });
});
