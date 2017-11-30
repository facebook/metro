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

const INITIAL_TIME = 1482363367000;

describe('DeltaPatcher', () => {
  const OriginalDate = global.Date;
  let deltaPatcher;

  function setCurrentTime(time: number) {
    global.Date = jest.fn(() => new OriginalDate(time));
  }

  beforeEach(() => {
    deltaPatcher = new DeltaPatcher();

    setCurrentTime(INITIAL_TIME);
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
    expect(
      deltaPatcher
        .applyDelta({
          reset: 1,
          pre: new Map([[1, {code: 'pre'}]]),
          post: new Map([[2, {code: 'post'}]]),
          delta: new Map([[3, {code: 'middle'}]]),
        })
        .getAllModules(),
    ).toMatchSnapshot();
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
      .getAllModules();

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
      .getAllModules();

    expect(anotherResult).toMatchSnapshot();

    expect(
      deltaPatcher
        .applyDelta({
          pre: new Map([[1000, {code: '1'}]]),
          post: new Map([[1000, {code: '1'}]]),
          delta: new Map([[12, {code: 'ten'}]]),
          reset: true,
        })
        .getAllModules(),
    ).toMatchSnapshot();
  });

  it('should return the number of modified files in the last Delta', () => {
    deltaPatcher.applyDelta({
      reset: 1,
      pre: new Map([[1, {code: 'pre'}]]),
      post: new Map([[2, {code: 'post'}]]),
      delta: new Map([[3, {code: 'middle'}]]),
    });

    expect(deltaPatcher.getLastNumModifiedFiles()).toEqual(3);

    deltaPatcher.applyDelta({
      reset: 1,
      pre: new Map([[1, null]]),
      post: new Map(),
      delta: new Map([[3, {code: 'different'}]]),
    });

    // A deleted module counts as a modified file.
    expect(deltaPatcher.getLastNumModifiedFiles()).toEqual(2);
  });

  it('should return the time it was last modified', () => {
    deltaPatcher.applyDelta({
      reset: 1,
      pre: new Map([[1, {code: 'pre'}]]),
      post: new Map([[2, {code: 'post'}]]),
      delta: new Map([[3, {code: 'middle'}]]),
    });

    expect(deltaPatcher.getLastModifiedDate().getTime()).toEqual(INITIAL_TIME);
    setCurrentTime(INITIAL_TIME + 1000);

    // Apply empty delta
    deltaPatcher.applyDelta({
      reset: 1,
      pre: new Map(),
      post: new Map(),
      delta: new Map(),
    });

    expect(deltaPatcher.getLastModifiedDate().getTime()).toEqual(INITIAL_TIME);
    setCurrentTime(INITIAL_TIME + 2000);

    deltaPatcher.applyDelta({
      reset: 1,
      pre: new Map(),
      post: new Map([[2, {code: 'newpost'}]]),
      delta: new Map(),
    });

    expect(deltaPatcher.getLastModifiedDate().getTime()).toEqual(
      INITIAL_TIME + 2000,
    );
  });
});
