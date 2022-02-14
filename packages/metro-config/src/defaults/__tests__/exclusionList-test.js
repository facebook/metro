/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
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

  function setPathSeperator(sep: string) {
    // $FlowFixMe: property sep is not writable.
    path.sep = sep;
  }

  beforeEach(() => {
    originalSeparator = path.sep;
  });

  afterEach(() => {
    // $FlowFixMe: property sep is not writable.
    path.sep = originalSeparator;
  });

  it('proves we can write to path.sep for setting up the tests', () => {
    setPathSeperator('/');
    expect(require('path').sep).toBe('/');
    setPathSeperator('\\');
    expect(require('path').sep).toBe('\\');
  });

  describe('simulate macOS/linux enviornment', () => {
    beforeEach(() => setPathSeperator('/'));

    it('converts forward slashes in the RegExp to the OS specific path separator', () => {
      // Simple case
      expect('a/b/c').toMatch(exclusionList([new RegExp('a/b/c')]));
      expect('a/b/c').toMatch(exclusionList([/a\/b\/c/]));
      // Regular expression that already considered OS specific path separator.
      expect('/foo/bar').toMatch(
        exclusionList([new RegExp('.*[/\\\\]foo[/\\\\]bar')]),
      );
      expect('/foo/bar').toMatch(exclusionList([/.*[/\\]foo[/\\]bar/]));
    });

    it('converts forward slashes in the string to the OS specific path separator', () => {
      // Simple case
      expect('a/b/c').toMatch(exclusionList(['a/b/c']));
      // Make sure the special characters are escaped properly
      expect('^.*[/\\1-9]{3}(foo)s+[/\\]bars?$').toMatch(
        exclusionList(['^.*[/\\1-9]{3}(foo)s+[/\\]bars?$']),
      );
    });

    it('converts forward slashes in the RegExp to the OS specific path separator in nodejs 10 or below', () => {
      // In node version 10 or below, the forward slash in brackets are escaped automatically.
      // eg. /[/\\]/ => /[\/\\]/
      // Ideally this test case should be removed and instead the whole test should run in
      // multiple node versions.
      // Regular expression that already considered OS specific path separator.
      expect('/foo/bar').toMatch(
        exclusionList([new RegExp('.*[\\/\\\\]foo[\\/\\\\]bar')]),
      );
      expect('/foo/bar').toMatch(exclusionList([/.*[\/\\]foo[\/\\]bar/]));
    });
  });

  describe('simulate windows enviornment', () => {
    beforeEach(() => setPathSeperator('\\'));

    it('converts forward slashes in the RegExp to the OS specific path separator', () => {
      // Simple case
      expect('a\\b\\c').toMatch(exclusionList([new RegExp('a/b/c')]));
      expect('a\\b\\c').toMatch(exclusionList([/a\/b\/c/]));
      // Regular expression that already considered OS specific path separator.
      expect('\\foo\\bar').toMatch(
        exclusionList([new RegExp('.*[/\\\\]foo[/\\\\]bar')]),
      );
      expect('\\foo\\bar').toMatch(exclusionList([/.*[/\\]foo[/\\]bar/]));
    });

    it('converts forward slashes in the string to the OS specific path separator', () => {
      // Simple case
      expect('a\\b\\c').toMatch(exclusionList(['a/b/c']));
      // Make sure the special characters are escaped properly
      expect('^.*[\\\\1-9]{3}(foo)s+[\\\\]bars?$').toMatch(
        exclusionList(['^.*[/\\1-9]{3}(foo)s+[/\\]bars?$']),
      );
    });

    it('converts forward slashes in the RegExp to the OS specific path separator in nodejs 10 or below', () => {
      // In node version 10 or below, the forward slash in brackets are escaped automatically.
      // eg. /[/\\]/ => /[\/\\]/
      // Ideally this test case should be removed and instead the whole test should run in
      // multiple node versions.
      // Regular expression that already considered OS specific path separator.
      expect('\\foo\\bar').toMatch(
        exclusionList([new RegExp('.*[\\/\\\\]foo[\\/\\\\]bar')]),
      );
      expect('\\foo\\bar').toMatch(exclusionList([/.*[\/\\]foo[\/\\]bar/]));
    });
  });
});
