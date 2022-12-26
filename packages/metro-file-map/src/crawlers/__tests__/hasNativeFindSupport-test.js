/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 * @oncall react_native
 */

import hasNativeFindSupport from '../node/hasNativeFindSupport';
import os from 'os';

test('hasNativeFindSupport returns true on non-win32', async () => {
  expect(await hasNativeFindSupport()).toBe(os.platform() !== 'win32');
});
