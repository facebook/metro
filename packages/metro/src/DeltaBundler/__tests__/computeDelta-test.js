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

const computeDelta = require('../computeDelta');

function sortById([id1]: [number, mixed], [id2]: [number, mixed]): number {
  return id1 - id2;
}

describe('computeDelta', () => {
  it('should compute a delta between two lists of entries', async () => {
    const delta = computeDelta(
      [
        [1, '__d(1);'],
        [0, '__d(0);'],
        [3, '__d(3);'],
        [4, '__d(4);'],
      ],
      [
        [6, '__d(6);'],
        [3, '__d(3.1);'],
        [0, '__d(0.1);'],
        [5, '__d(5);'],
      ],
    );

    const added = delta.added.slice().sort(sortById);
    const modified = delta.modified.slice().sort(sortById);
    const deleted = delta.deleted.slice().sort((a, b) => a - b);

    expect(added).toEqual([
      [5, '__d(5);'],
      [6, '__d(6);'],
    ]);
    expect(modified).toEqual([
      [0, '__d(0.1);'],
      [3, '__d(3.1);'],
    ]);
    expect(deleted).toEqual([1, 4]);
  });
});
