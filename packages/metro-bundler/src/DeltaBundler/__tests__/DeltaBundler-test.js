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

jest.mock('../DeltaTransformer');
jest.mock('../../Bundler');

const Bundler = require('../../Bundler');
const DeltaTransformer = require('../DeltaTransformer');

const DeltaBundler = require('../');

describe('DeltaBundler', () => {
  const OriginalDate = global.Date;
  let deltaBundler;
  let bundler;
  const initialTransformerResponse = {
    pre: new Map([[1, {code: 'pre'}]]),
    post: new Map([[2, {code: 'post'}]]),
    delta: new Map([[3, {code: 'module3'}], [4, {code: 'another'}]]),
    inverseDependencies: [],
    reset: true,
  };

  function setCurrentTime(time: number) {
    global.Date = jest.fn(() => new OriginalDate(time));
  }

  beforeEach(() => {
    DeltaTransformer.prototype.getDelta = jest
      .fn()
      .mockReturnValueOnce(Promise.resolve(initialTransformerResponse));

    DeltaTransformer.create = jest
      .fn()
      .mockReturnValue(Promise.resolve(new DeltaTransformer()));

    bundler = new Bundler();
    deltaBundler = new DeltaBundler(bundler, {});

    setCurrentTime(1482363367000);
  });

  it('should create a new transformer to build the initial bundle', async () => {
    expect(await deltaBundler.build({deltaBundleId: 10})).toEqual({
      ...initialTransformerResponse,
      id: 10,
    });

    expect(DeltaTransformer.create.mock.calls.length).toBe(1);
  });

  it('should reuse the same transformer after a second call', async () => {
    const secondResponse = {
      delta: new Map([[3, {code: 'a different module'}]]),
      pre: new Map(),
      post: new Map(),
      inverseDependencies: [],
    };

    DeltaTransformer.prototype.getDelta.mockReturnValueOnce(
      Promise.resolve(secondResponse),
    );

    await deltaBundler.build({deltaBundleId: 10});

    expect(await deltaBundler.build({deltaBundleId: 10})).toEqual({
      ...secondResponse,
      id: 10,
    });

    expect(DeltaTransformer.create.mock.calls.length).toBe(1);
  });

  it('should reset everything after calling end()', async () => {
    await deltaBundler.build({deltaBundleId: 10});

    deltaBundler.end();

    await deltaBundler.build({deltaBundleId: 10});

    expect(DeltaTransformer.create.mock.calls.length).toBe(2);
  });

  it('should build the whole stringified bundle', async () => {
    expect(
      await deltaBundler.buildFullBundle({deltaBundleId: 10}),
    ).toMatchSnapshot();

    DeltaTransformer.prototype.getDelta.mockReturnValueOnce(
      Promise.resolve({
        delta: new Map([[3, {code: 'modified module'}], [4, null]]),
        pre: new Map([[5, {code: 'more pre'}]]),
        post: new Map([[6, {code: 'bananas'}], [7, {code: 'apples'}]]),
        inverseDependencies: [],
      }),
    );

    expect(
      await deltaBundler.buildFullBundle({deltaBundleId: 10}),
    ).toMatchSnapshot();
  });
});
