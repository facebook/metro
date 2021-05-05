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

jest.mock('fs', () => new (require('metro-memory-fs'))());

const fs = require('fs');
const getCacheKey = require('../index');

beforeAll(() => {
  fs.writeFileSync('/a.txt', 'dummy content for a.txt');
  fs.writeFileSync('/copy_of_a.txt', 'dummy content for a.txt');
  fs.writeFileSync('/b.txt', 'dummy content for b.txt');
});

test('calculates a cache key for a list of files', () => {
  expect(getCacheKey(['/a.txt'])).toMatchInlineSnapshot(
    `"159acfc2c1c60c655a305cb711c7bd2c"`,
  );

  expect(getCacheKey(['/a.txt', '/b.txt'])).toMatchInlineSnapshot(
    `"1e34c10b2663b4681858340ec5da03ce"`,
  );
});

test('generates different keys for different files', () => {
  expect(getCacheKey(['/a.txt'])).not.toEqual(getCacheKey(['/b.txt']));
});

test('generates identical keys for identical files', () => {
  expect(getCacheKey(['/a.txt'])).toEqual(getCacheKey(['/copy_of_a.txt']));
});
