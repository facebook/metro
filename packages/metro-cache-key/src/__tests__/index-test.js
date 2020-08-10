/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @emails oncall+metro_bundler
 */

'use strict';

const getCacheKey = require('../index');

test('calculates a cache key for a list of files', () => {
  expect(getCacheKey([require.resolve('../index')])).toEqual(
    '00138583bedb3659eeb7d68bd47ebb6d',
  );

  expect(
    getCacheKey([require.resolve('../index'), require.resolve('ob1')]),
  ).toEqual('d835dbaaf1d751bba4dcb1ad92f90ff9');
});

test('generates different keys for different files', () => {
  expect(getCacheKey([require.resolve('../index')])).not.toEqual(
    getCacheKey([require.resolve('ob1')]),
  );
});
