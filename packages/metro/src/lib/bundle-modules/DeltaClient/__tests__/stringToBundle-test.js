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

const bundleToString = require('../bundleToString');
const stringToBundle = require('../stringToBundle');

describe('stringToBundle', () => {
  it('parses a bundle from a string and metadata', () => {
    expect(
      stringToBundle(
        `pre
0
1.0
post
`,
        {pre: 3, post: 4, modules: [[0, 1], [100, 3]]},
      ),
    ).toEqual({
      pre: 'pre',
      post: 'post',
      modules: [[0, '0'], [100, '1.0']],
    });
  });

  it('retrieves the original bundle from bundleToString', () => {
    function testBundle(bundle) {
      const {code, metadata} = bundleToString(bundle);
      expect(stringToBundle(code, metadata)).toEqual(bundle);
    }

    testBundle({
      pre: 'pre',
      post: 'post',
      modules: [[0, '__d(0);']],
    });

    testBundle({
      pre: 'pre',
      post: 'post',
      modules: [[0, '__d(0);'], [1, '__d(1);']],
    });

    testBundle({
      pre: 'pre',
      post: 'post',
      modules: [],
    });

    testBundle({
      pre: 'pre',
      post: 'post',
      modules: [[0, ''], [1, '__d(1);']],
    });

    testBundle({
      pre: 'pre',
      post: 'post',
      modules: [[0, '__d(0);'], [1, '']],
    });

    testBundle({
      pre: 'pre',
      post: 'post',
      modules: [[0, '__d(0);'], [1, ''], [2, '__d(2);']],
    });

    testBundle({
      pre: '',
      post: 'post',
      modules: [[0, '__d(0);']],
    });

    testBundle({
      pre: 'pre',
      post: '',
      modules: [[0, '__d(0);']],
    });

    testBundle({
      pre: '',
      post: '',
      modules: [[0, '__d(0);']],
    });

    testBundle({
      pre: '',
      post: '',
      modules: [],
    });

    testBundle({
      pre: '',
      post: '',
      modules: [[0, '']],
    });
  });
});
