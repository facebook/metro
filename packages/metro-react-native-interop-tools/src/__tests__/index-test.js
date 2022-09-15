/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall metro_bundler
 */

import run from '../index';

test('returns Hello World', () => {
  expect(run()).toEqual('Hello World');
});
