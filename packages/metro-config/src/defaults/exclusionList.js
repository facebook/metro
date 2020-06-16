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
    return pattern.source.replace(/\//g, path.sep);
  } else if (typeof pattern === 'string') {
    var escaped = pattern.replace(/[\-\[\]\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
    // convert the '/' into an escaped local file separator
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
