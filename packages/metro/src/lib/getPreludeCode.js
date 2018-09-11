/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 */

'use strict';

function getPreludeCode({
  extraVars,
  isDev,
}: {|
  +extraVars?: {[string]: mixed},
  +isDev: boolean,
|}): string {
  const vars = [
    ...formatExtraVars(extraVars),
    `__DEV__=${String(isDev)}`,
    '__BUNDLE_START_TIME__=this.nativePerformanceNow?nativePerformanceNow():Date.now()',
    'process=this.process||{}',
  ];
  return `var ${vars.join(',')};${processEnv(
    isDev ? 'development' : 'production',
  )}`;
}

function formatExtraVars(extraVars) {
  const assignments = [];
  for (const key in extraVars) {
    assignments.push(`${key}=${JSON.stringify(extraVars[key])}`);
  }
  return assignments;
}

function processEnv(nodeEnv) {
  return `process.env=process.env||{};process.env.NODE_ENV=${JSON.stringify(
    nodeEnv,
  )};`;
}

module.exports = getPreludeCode;
