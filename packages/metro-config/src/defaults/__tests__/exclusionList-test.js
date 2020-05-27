/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @flow
 * @format
 */

'use strict';

const exclusionList = require('../exclusionList');
const path = require('path');

describe('exclusionList', () => {
  let originalSeparator;
  beforeEach(() => {
    originalSeparator = path.sep;
  });

  afterEach(() => {
    // $FlowFixMe: property sep is not writable.
    path.sep = originalSeparator;
  });

  it('converts forward slashes in the RegExp to the OS specific path separator', () => {
    // $FlowFixMe: property sep is not writable.
    path.sep = '/';
    expect('a/b/c').toMatch(exclusionList([new RegExp('a/b/c')]));

    // $FlowFixMe: property sep is not writable.
    path.sep = '\\';
    expect(require('path').sep).toBe('\\');
    expect('a\\b\\c').toMatch(exclusionList([new RegExp('a/b/c')]));
  });
});
