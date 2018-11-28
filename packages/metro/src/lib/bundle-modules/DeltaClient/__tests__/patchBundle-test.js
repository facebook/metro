/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+js_foundation
 * @format
 */

'use strict';

const patchBundle = require('../patchBundle');

describe('patchBundle', () => {
  it('patches a bundle with a delta bundle', () => {
    expect(
      patchBundle(
        {
          pre: 'pre',
          post: 'post',
          modules: [[0, '0'], [1, '1']],
        },
        {
          added: [[2, '2']],
          modified: [[0, '0.1']],
          deleted: [1],
        },
      ),
    ).toEqual({
      pre: 'pre',
      post: 'post',
      modules: [[0, '0.1'], [2, '2']],
    });
  });
});
