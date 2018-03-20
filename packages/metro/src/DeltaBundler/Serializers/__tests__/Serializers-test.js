/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

jest.mock('../../../node-haste/lib/toLocalPath');
jest.mock('../../../Assets');

const toLocalPath = require('../../../node-haste/lib/toLocalPath');

const CURRENT_TIME = 1482363367000;

describe('Serializers', () => {
  const OriginalDate = global.Date;
  const getDelta = jest.fn();
  const getDependenciesFn = jest.fn();
  const postProcessModules = jest.fn();
  let deltaBundler;
  let Serializers;

  const deltaResponse = {
    id: '1234',
    pre: new Map([[1, {type: 'script', code: 'pre;', id: 1, path: '/pre.js'}]]),
    post: new Map([[2, {type: 'require', code: 'post;', id: 2, path: '/p'}]]),
    delta: new Map([
      [3, {type: 'module', code: 'module3;', id: 3, path: '/3.js'}],
      [4, {type: 'module', code: 'another;', id: 4, path: '/4.js'}],
    ]),
    inverseDependencies: [],
    reset: true,
  };

  function setCurrentTime(time: number) {
    global.Date = jest.fn(() => new OriginalDate(time));
  }

  beforeEach(() => {
    Serializers = require('../Serializers');

    getDelta.mockReturnValueOnce(Promise.resolve(deltaResponse));
    getDependenciesFn.mockReturnValue(Promise.resolve(() => new Set()));
    postProcessModules.mockImplementation(modules => modules);

    deltaBundler = {
      getDeltaTransformer: jest.fn().mockReturnValue(
        Promise.resolve({
          getDelta,
          getDependenciesFn,
        }),
      ),
      getPostProcessModulesFn() {
        return postProcessModules;
      },
    };

    toLocalPath.mockImplementation((roots, path) => path.replace(roots[0], ''));

    setCurrentTime(CURRENT_TIME);
  });

  it('should return the stringified delta bundle', async () => {
    expect(
      await Serializers.deltaBundle(deltaBundler, 'foo', {deltaBundleId: 10}),
    ).toMatchSnapshot();

    // Simulate a delta with some changes now
    getDelta.mockReturnValueOnce(
      Promise.resolve({
        id: '1234',
        delta: new Map([[3, {code: 'modified module;'}], [4, null]]),
        pre: new Map(),
        post: new Map(),
        inverseDependencies: [],
      }),
    );

    expect(
      await Serializers.deltaBundle(deltaBundler, 'foo', {deltaBundleId: 10}),
    ).toMatchSnapshot();
  });
});
