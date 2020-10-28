/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

var path = require('path');

var list = [/website\/node_modules\/.*/, /.*\/__tests__\/.*/];

function escapeRegExp(pattern) {
  if (Object.prototype.toString.call(pattern) === '[object RegExp]') {
    // the forward slash may or may not be escaped in regular expression depends
    // on if it's in brackets. eg. /foo\/bar/ and /[/\\]foo/ are both valid.
    // We should replace all forward slashes to proper OS specific separators.
    // The separator needs to be escaped in the regular expression source string,
    // hence the '\\' prefix.
    return pattern.source.replace(/\/|\\\//g, '\\' + path.sep);
  } else if (typeof pattern === 'string') {
    // escape back slashes in regular expression so that when
    // it's used in RegExp constructor, the back slashes are preserved.
    // var escaped = pattern.replace(/[\-\[\]\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
    var escaped = pattern.replace(/\\/g, '\\$&');
    // convert the '/' into an escaped local file separator. The separator needs
    // to be escaped in the regular expression source string, hence the '\\' prefix.
    return escaped.replace(/\//g, '\\' + path.sep);
  } else {
    throw new Error('Unexpected exclusion pattern: ' + pattern);
  }
}

function exclusionList(additionalExclusions) {
  return new RegExp(
    '(' +
      (additionalExclusions || [])
        .concat(list)
        .map(escapeRegExp)
        .join('|') +
      ')$',
  );
}

module.exports = exclusionList;
