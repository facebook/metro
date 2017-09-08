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
        pre: 'pre',
        post: 'post',
        delta: {},
      }),
    ).toThrow();
  });

  it('should apply an initial delta correctly', () => {
    const result = deltaPatcher
      .applyDelta({
        reset: 1,
        pre: 'pre',
        post: 'post',
        delta: {
          1: 'middle',
        },
      })
      .stringify();

    expect(result).toMatchSnapshot();
  });

  it('should apply many different patches correctly', () => {
    const result = deltaPatcher
      .applyDelta({
        reset: 1,
        pre: 'pre',
        post: 'post',
        delta: {
          1: 'middle',
        },
      })
      .applyDelta({
        delta: {
          2: 'another',
        },
      })
      .applyDelta({
        delta: {
          2: 'another',
          87: 'third',
        },
      })
      .stringify();

    expect(result).toMatchSnapshot();

    const anotherResult = deltaPatcher
      .applyDelta({
        pre: 'new pre',
        delta: {
          2: 'another',
          1: null,
        },
      })
      .applyDelta({
        delta: {
          2: null,
          12: 'twelve',
        },
      })
      .stringify();

    expect(anotherResult).toMatchSnapshot();

    expect(
      deltaPatcher
        .applyDelta({
          pre: '1',
          post: '1',
          delta: {
            12: 'ten',
          },
          reset: true,
        })
        .stringify(),
    ).toMatchSnapshot();
  });
});
