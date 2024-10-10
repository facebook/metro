/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import jestFilter from './jestFilter';
import callsites from 'callsites';

const origTest = test;
global.test = (testName, ...args) => {
  const calledFromFile = callsites()[1].getFileName();
  const shouldSkip = Object.entries(jestFilter).some(
    ([ignoredFile, ignoredTestNames]) => {
      return (
        calledFromFile.endsWith(ignoredFile) &&
        ignoredTestNames.includes(testName)
      );
    },
  );
  return (shouldSkip ? origTest.skip : origTest)(testName, ...args);
};
