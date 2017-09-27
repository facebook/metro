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
  let deltaBundler;
  let bundler;
  const initialTransformerResponse = {
    pre: new Map([[1, {code: 'pre'}]]),
    post: new Map([[2, {code: 'post'}]]),
    delta: new Map([[3, {code: 'module3'}], [4, {code: 'another'}]]),
    inverseDependencies: [],
    reset: true,
  };

  beforeEach(() => {
    DeltaTransformer.prototype.getDelta = jest
      .fn()
      .mockReturnValueOnce(Promise.resolve(initialTransformerResponse));

    DeltaTransformer.create = jest
      .fn()
      .mockReturnValue(Promise.resolve(new DeltaTransformer()));

    bundler = new Bundler();
    deltaBundler = new DeltaBundler(bundler, {});
  });

  it('should create a new transformer the first time it gets called', async () => {
    await deltaBundler.getDeltaTransformer({deltaBundleId: 10});

    expect(DeltaTransformer.create.mock.calls.length).toBe(1);
  });

  it('should reuse the same transformer after a second call', async () => {
    await deltaBundler.getDeltaTransformer({deltaBundleId: 10});
    await deltaBundler.getDeltaTransformer({deltaBundleId: 10});

    expect(DeltaTransformer.create.mock.calls.length).toBe(1);
  });

  it('should create different transformers when there is no delta bundle id', async () => {
    await deltaBundler.getDeltaTransformer({});
    await deltaBundler.getDeltaTransformer({});

    expect(DeltaTransformer.create.mock.calls.length).toBe(2);
  });

  it('should reset everything after calling end()', async () => {
    await deltaBundler.getDeltaTransformer({deltaBundleId: 10});

    deltaBundler.end();

    await deltaBundler.getDeltaTransformer({deltaBundleId: 10});

    expect(DeltaTransformer.create.mock.calls.length).toBe(2);
  });
});
