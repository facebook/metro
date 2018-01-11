/**
 * Copyright (c) 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @format
 */

'use strict';

function getPreludeCode({isDev}: {|+isDev: boolean|}): string {
  return (
    `var __DEV__=${String(isDev)},` +
    '__BUNDLE_START_TIME__=this.nativePerformanceNow?nativePerformanceNow():Date.now(),' +
    'process=this.process||{};process.env=process.env||{};' +
    `process.env.NODE_ENV='${isDev ? 'development' : 'production'}';`
  );
}

module.exports = getPreludeCode;
