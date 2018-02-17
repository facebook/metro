/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */
'use strict';

const mockColor = () => {
  return {
    bold: () => {
      return {};
    },
  };
};

mockColor.bold = function() {
  return {};
};

mockColor.bgRed = function() {
  return {};
};

module.exports = {
  dim: <T>(s: T) => s, // (elaborate way of saying "any", fine for this case)
  magenta: mockColor,
  white: mockColor,
  blue: mockColor,
  yellow: mockColor,
  green: mockColor,
  bold: mockColor,
  red: mockColor,
  cyan: mockColor,
  gray: mockColor,
  black: mockColor,
};
