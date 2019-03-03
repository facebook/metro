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
          base: true,
          revisionId: 'rev0',
          pre: 'pre',
          post: 'post',
          modules: [[0, '0'], [1, '1']],
        },
        {
          base: false,
          revisionId: 'rev1',
          modules: [[0, '0.1']],
          deleted: [1],
        },
      ),
    ).toEqual({
      base: true,
      revisionId: 'rev1',
      pre: 'pre',
      post: 'post',
      modules: [[0, '0.1']],
    });
  });

  it('replaces a bundle with another bundle', () => {
    expect(
      patchBundle(
        {
          base: true,
          revisionId: 'rev0',
          pre: 'pre1',
          post: 'post1',
          modules: [[0, '0'], [1, '1']],
        },
        {
          base: true,
          revisionId: 'rev1',
          pre: 'pre2',
          post: 'post2',
          modules: [[2, '2']],
        },
      ),
    ).toEqual({
      base: true,
      revisionId: 'rev1',
      pre: 'pre2',
      post: 'post2',
      modules: [[2, '2']],
    });
  });
});
