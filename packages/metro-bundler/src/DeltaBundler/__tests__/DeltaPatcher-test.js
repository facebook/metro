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

const DeltaPatcher = require('../DeltaPatcher');

describe('DeltaPatcher', () => {
  let deltaPatcher;

  beforeEach(() => {
    deltaPatcher = new DeltaPatcher();
  });

  it('should throw if received a non-reset delta as the initial one', () => {
    expect(() =>
      deltaPatcher.applyDelta({
        pre: new Map(),
        post: new Map(),
        delta: new Map(),
      }),
    ).toThrow();
  });

  it('should apply an initial delta correctly', () => {
    const result = deltaPatcher
      .applyDelta({
        reset: 1,
        pre: new Map([[1, {code: 'pre'}]]),
        post: new Map([[2, {code: 'post'}]]),
        delta: new Map([[3, {code: 'middle'}]]),
      })
      .stringifyCode();

    expect(result).toMatchSnapshot();
  });

  it('should apply many different patches correctly', () => {
    const result = deltaPatcher
      .applyDelta({
        reset: 1,
        pre: new Map([[1000, {code: 'pre'}]]),
        post: new Map([[2000, {code: 'post'}]]),
        delta: new Map([[1, {code: 'middle'}]]),
      })
      .applyDelta({
        pre: new Map(),
        post: new Map(),
        delta: new Map([[2, {code: 'another'}]]),
      })
      .applyDelta({
        pre: new Map(),
        post: new Map(),
        delta: new Map([[2, {code: 'another'}], [87, {code: 'third'}]]),
      })
      .stringifyCode();

    expect(result).toMatchSnapshot();

    const anotherResult = deltaPatcher
      .applyDelta({
        pre: new Map([[1000, {code: 'new pre'}]]),
        post: new Map(),
        delta: new Map([[2, {code: 'another'}], [1, null]]),
      })
      .applyDelta({
        pre: new Map(),
        post: new Map(),
        delta: new Map([[2, null], [12, {code: 'twelve'}]]),
      })
      .stringifyCode();

    expect(anotherResult).toMatchSnapshot();

    expect(
      deltaPatcher
        .applyDelta({
          pre: new Map([[1000, {code: '1'}]]),
          post: new Map([[1000, {code: '1'}]]),
          delta: new Map([[12, {code: 'ten'}]]),
          reset: true,
        })
        .stringifyCode(),
    ).toMatchSnapshot();
  });
});
