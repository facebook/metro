/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

const Serializers = require('../Serializers');

const CURRENT_TIME = 1482363367000;

describe('Serializers', () => {
  const OriginalDate = global.Date;
  const getDelta = jest.fn();
  let deltaBundler;

  const deltaResponse = {
    pre: new Map([[1, {code: 'pre;'}]]),
    post: new Map([[2, {code: 'post;'}]]),
    delta: new Map([[3, {code: 'module3;'}], [4, {code: 'another;'}]]),
    inverseDependencies: [],
    reset: true,
  };

  function setCurrentTime(time: number) {
    global.Date = jest.fn(() => new OriginalDate(time));
  }

  beforeEach(() => {
    getDelta.mockReturnValueOnce(Promise.resolve(deltaResponse));

    deltaBundler = {
      async getDeltaTransformer() {
        return {
          id: '1234',
          deltaTransformer: {
            getDelta,
          },
        };
      },
    };

    setCurrentTime(CURRENT_TIME);
  });

  it('should return the stringified delta bundle', async () => {
    expect(
      await Serializers.deltaBundle(deltaBundler, {deltaBundleId: 10}),
    ).toMatchSnapshot();

    // Simulate a delta with some changes now
    getDelta.mockReturnValueOnce(
      Promise.resolve({
        delta: new Map([[3, {code: 'modified module;'}], [4, null]]),
        pre: new Map(),
        post: new Map(),
        inverseDependencies: [],
      }),
    );

    expect(
      await Serializers.deltaBundle(deltaBundler, {deltaBundleId: 10}),
    ).toMatchSnapshot();
  });

  it('should build the full JS bundle', async () => {
    expect(
      await Serializers.fullBundle(deltaBundler, {deltaBundleId: 10}),
    ).toMatchSnapshot();

    getDelta.mockReturnValueOnce(
      Promise.resolve({
        delta: new Map([[3, {code: 'modified module;'}], [4, null]]),
        pre: new Map([[5, {code: 'more pre;'}]]),
        post: new Map([[6, {code: 'bananas;'}], [7, {code: 'apples;'}]]),
        inverseDependencies: [],
      }),
    );
    setCurrentTime(CURRENT_TIME + 5000);

    expect(
      await Serializers.fullBundle(deltaBundler, {
        deltaBundleId: 10,
        sourceMapUrl: 'http://localhost:8081/myBundle.js',
      }),
    ).toMatchSnapshot();
  });

  // This test actually does not test the sourcemaps generation logic, which
  // is already tested in the source-map file.
  it('should build the full Source Maps', async () => {
    expect(
      await Serializers.fullSourceMap(deltaBundler, {deltaBundleId: 10}),
    ).toMatchSnapshot();

    getDelta.mockReturnValueOnce(
      Promise.resolve({
        delta: new Map([[3, {code: 'modified module;'}], [4, null]]),
        pre: new Map([[5, {code: 'more pre;'}]]),
        post: new Map([[6, {code: 'bananas;'}], [7, {code: 'apples;'}]]),
        inverseDependencies: [],
      }),
    );
    setCurrentTime(CURRENT_TIME + 5000);

    expect(
      await Serializers.fullSourceMap(deltaBundler, {deltaBundleId: 10}),
    ).toMatchSnapshot();
  });

  it('should return all the bundle modules', async () => {
    expect(
      await Serializers.getAllModules(deltaBundler, {deltaBundleId: 10}),
    ).toMatchSnapshot();

    getDelta.mockReturnValueOnce(
      Promise.resolve({
        delta: new Map([[3, {code: 'modified module;'}], [4, null]]),
        pre: new Map([[5, {code: 'more pre;'}]]),
        post: new Map([[6, {code: 'bananas;'}], [7, {code: 'apples;'}]]),
        inverseDependencies: [],
      }),
    );

    expect(
      await Serializers.getAllModules(deltaBundler, {deltaBundleId: 10}),
    ).toMatchSnapshot();
  });
});
