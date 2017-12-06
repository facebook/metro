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

jest.mock('../../node-haste/lib/toLocalPath');
jest.mock('../../AssetServer/util');

const {getAssetData} = require('../../AssetServer/util');
const toLocalPath = require('../../node-haste/lib/toLocalPath');

const CURRENT_TIME = 1482363367000;

describe('Serializers', () => {
  const OriginalDate = global.Date;
  const getDelta = jest.fn();
  const getDependenciesFn = jest.fn();
  const getRamOptions = jest.fn();
  const postProcessModules = jest.fn();
  let deltaBundler;
  let Serializers;

  const deltaResponse = {
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
    getRamOptions.mockReturnValue(
      Promise.resolve({
        preloadedModules: {},
        ramGroups: [],
      }),
    );
    postProcessModules.mockImplementation(modules => modules);

    deltaBundler = {
      async getDeltaTransformer() {
        return {
          id: '1234',
          deltaTransformer: {
            getDelta,
            getDependenciesFn,
            getRamOptions,
          },
        };
      },
      getPostProcessModulesFn() {
        return postProcessModules;
      },
      getOptions() {
        return {
          projectRoots: ['/foo'],
        };
      },
    };

    getAssetData.mockImplementation((path, localPath, platform) => ({
      path,
      platform,
      assetData: true,
    }));

    toLocalPath.mockImplementation((roots, path) => path.replace(roots[0], ''));

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

  it('should return the RAM bundle info', async () => {
    expect(
      await Serializers.getRamBundleInfo(deltaBundler, {deltaBundleId: 10}),
    ).toMatchSnapshot();

    getDelta.mockReturnValueOnce(
      Promise.resolve({
        delta: new Map([
          [3, {type: 'module', code: 'modified;', id: 3, path: '/foo/3.js'}],
          [7, {type: 'asset', code: 'code', id: 7, path: '/foo/path.png'}],
          [8, {type: 'module', code: 'code', id: 8, path: '/foo/8.js'}],
          [9, {type: 'asset', code: 'code', id: 9, path: '/foo/path3.png'}],
        ]),
        pre: new Map([
          [5, {type: 'script', code: 'more pre;', id: 5, path: '/foo/5.js'}],
        ]),
        post: new Map([
          [6, {type: 'require', code: 'bananas;', id: 6, path: '/foo/6.js'}],
          [10, {type: 'comment', code: 'bananas;', id: 10, path: '/foo/10.js'}],
        ]),
        inverseDependencies: [],
      }),
    );

    expect(
      await Serializers.getRamBundleInfo(deltaBundler, {deltaBundleId: 10}),
    ).toMatchSnapshot();
  });

  it('should use the preloadedModules and ramGroup configs to build a RAM bundle', async () => {
    getDelta.mockReset();
    getDependenciesFn.mockReset();

    getDelta.mockReturnValue(
      Promise.resolve({
        delta: new Map([
          [3, {type: 'module', code: 'code', id: 3, path: '/foo/3.js'}],
          [4, {type: 'module', code: 'code', id: 4, path: '/foo/4.js'}],
          [5, {type: 'module', code: 'code', id: 5, path: '/foo/5.js'}],
          [6, {type: 'module', code: 'code', id: 6, path: '/foo/6.js'}],
        ]),
        pre: new Map([
          [7, {type: 'script', code: 'more pre;', id: 7, path: '/foo/7.js'}],
        ]),
        post: new Map([
          [8, {type: 'require', code: 'bananas;', id: 8, path: '/foo/8.js'}],
        ]),
        inverseDependencies: [],
        reset: 1,
      }),
    );

    getRamOptions.mockReturnValue(
      Promise.resolve({
        preloadedModules: {'/foo/3.js': true},
        ramGroups: ['/foo/5.js'],
      }),
    );

    getDependenciesFn.mockReturnValue(
      Promise.resolve(path => {
        expect(path).toBe('/foo/5.js');

        return new Set(['/foo/6.js']);
      }),
    );

    expect(
      await Serializers.getRamBundleInfo(deltaBundler, {deltaBundleId: 10}),
    ).toMatchSnapshot();
  });

  it('should return the bundle assets', async () => {
    expect(
      await Serializers.getAllModules(deltaBundler, {deltaBundleId: 10}),
    ).toMatchSnapshot();

    getDelta.mockReturnValueOnce(
      Promise.resolve({
        delta: new Map([
          [3, {code: 'modified module;'}],
          [7, {code: 'code', type: 'asset', path: '/foo/path.png'}],
          [8, {code: 'code', type: 'module', path: '/foo/path2.png'}],
          [9, {code: 'code', type: 'asset', path: '/foo/path3.png'}],
        ]),
        pre: new Map([[5, {code: 'more pre;'}]]),
        post: new Map([[6, {code: 'bananas;'}]]),
        inverseDependencies: [],
      }),
    );

    expect(
      await Serializers.getAssets(deltaBundler, {
        deltaBundleId: 10,
        platform: 'ios',
      }),
    ).toMatchSnapshot();
  });

  it('should post-process the modules', async () => {
    postProcessModules.mockImplementation(modules => {
      return modules.sort(
        (a, b) => +(a.path < b.path) || +(a.path === b.path) - 1,
      );
    });

    expect(
      await Serializers.getAllModules(deltaBundler, {
        deltaBundleId: 10,
      }),
    ).toMatchSnapshot();
  });
});
