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

const stringToBundle = require('../stringToBundle');

describe('stringToBundle', () => {
  it('parses a bundle from a string', () => {
    expect(
      stringToBundle(`pre
0
1.0
post
//# offsetTable={"pre":3,"post":4,"modules":[[0,1],[100,3]],"revisionId":"rev0"}`),
    ).toEqual({
      base: true,
      revisionId: 'rev0',
      pre: 'pre',
      post: 'post',
      modules: [[0, '0'], [100, '1.0']],
    });
  });

  it('throws an error when the string bundle does not contain a pragma', () => {
    expect(() =>
      stringToBundle(`pre
0
1.0
post`),
    ).toThrowErrorMatchingInlineSnapshot(
      '"stringToBundle: Pragma not found in string bundle."',
    );
  });
});
