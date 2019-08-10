/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 */

'use strict';

const stableHash = require('../stableHash');

describe('stableHash', () => {
  it('ensures that the hash implementation supports switched order properties', () => {
    const sortedHash = stableHash({
      a: 3,
      b: 4,
      c: {
        d: 'd',
        e: 'e',
      },
    });

    const unsortedHash = stableHash({
      b: 4,
      c: {
        e: 'e',
        d: 'd',
      },
      a: 3,
    });

    expect(unsortedHash).toEqual(sortedHash);
  });
});
