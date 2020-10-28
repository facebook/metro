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

  it('proves we can write to path.sep for setting up the tests', () => {
    // $FlowFixMe: property sep is not writable.
    path.sep = '/';
    expect(require('path').sep).toBe('/');
    // $FlowFixMe: property sep is not writable.
    path.sep = '\\';
    expect(require('path').sep).toBe('\\');
  });

  it('converts forward slashes in the RegExp to the OS specific path separator in macOS/linux', () => {
    // $FlowFixMe: property sep is not writable.
    path.sep = '/';
    // Simple case
    expect('a/b/c').toMatch(exclusionList([new RegExp('a/b/c')]));
    expect('a/b/c').toMatch(exclusionList([/a\/b\/c/]));
    // Regular expression that already considered OS specific path separator.
    // When explictly construct RegExp instance, the string needs to be escaped first.
    // eg. /.*[/\\]foo[/\\]bar/ => '.*[/\\\\]foo[/\\\\]bar'
    expect('/foo/bar').toMatch(exclusionList([new RegExp('.*[/\\\\]foo[/\\\\]bar')]));
    expect('/foo/bar').toMatch(exclusionList([/.*[/\\]foo[/\\]bar/]));
  });

  it('converts forward slashes in the RegExp to the OS specific path separator in windows', () => {
    // $FlowFixMe: property sep is not writable.
    path.sep = '\\';
    // Simple case
    expect('a\\b\\c').toMatch(exclusionList([new RegExp('a/b/c')]));
    expect('a\\b\\c').toMatch(exclusionList([/a\/b\/c/]));
    // Regular expression that already considered OS specific path separator.
    // When explictly construct RegExp instance, the string needs to be escaped first.
    // eg. /.*[/\\]foo[/\\]bar/ => '.*[/\\\\]foo[/\\\\]bar'
    expect('\\foo\\bar').toMatch(exclusionList([new RegExp('.*[/\\\\]foo[/\\\\]bar')]));
    expect('\\foo\\bar').toMatch(exclusionList([/.*[/\\]foo[/\\]bar/]));
  });

  it('converts forward slashes in the string to the OS specific path separator in macOS/linux', () => {
    // $FlowFixMe: property sep is not writable.
    path.sep = '/';
    // Simple case
    expect('a/b/c').toMatch(exclusionList(['a/b/c']));
    // Strings that already considered OS specific path separator.
    expect('/foo/bar').toMatch(exclusionList(['.*[/\\]foo[/\\]bar']));
  });

  it('converts forward slashes in the string to the OS specific path separator in windows', () => {
    // $FlowFixMe: property sep is not writable.
    path.sep = '\\';
    // Simple case
    expect('a\\b\\c').toMatch(exclusionList(['a/b/c']));
    // Strings that already considered OS specific path separator.
    expect('\\foo\\bar').toMatch(exclusionList(['.*[/\\]foo[/\\]bar']));
  });

  it('converts forward slashes in the RegExp to the OS specific path separator for macOS/linux in nodejs 10 or below', () => {
    // In node version 10 or below, the forward slash in brackets are escaped automatically.
    // eg. /[/\\]/ => /[\/\\]/
    // Ideally this test case should be removed and instead the whole test should run in
    // multiple node versions.
    // $FlowFixMe: property sep is not writable.
    path.sep = '/';
    // Regular expression that already considered OS specific path separator.
    // When explictly construct RegExp instance, the string needs to be escaped first.
    // eg. /.*[\/\\]foo[\/\\]bar/ => '.*[\\/\\\\]foo[\\/\\\\]bar'
    expect('/foo/bar').toMatch(exclusionList([new RegExp('.*[\\/\\\\]foo[\\/\\\\]bar')]));
    expect('/foo/bar').toMatch(exclusionList([/.*[\/\\]foo[\/\\]bar/]));
  });

  it('converts forward slashes in the RegExp to the OS specific path separator for windows in nodejs 10 or below', () => {
    // In node version 10 or below, the forward slash in brackets are escaped automatically.
    // eg. /[/\\]/ => /[\/\\]/
    // Ideally this test case should be removed and instead the whole test should run in
    // multiple node versions.
    // $FlowFixMe: property sep is not writable.
    path.sep = '\\';
    // Regular expression that already considered OS specific path separator.
    // When explictly construct RegExp instance, the string needs to be escaped first.
    // eg. /.*[\/\\]foo[\/\\]bar/ => '.*[\\/\\\\]foo[\\/\\\\]bar'
    expect('\\foo\\bar').toMatch(exclusionList([new RegExp('.*[\\/\\\\]foo[\\/\\\\]bar')]));
    expect('\\foo\\bar').toMatch(exclusionList([/.*[\/\\]foo[\/\\]bar/]));
  });
});
