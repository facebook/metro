/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

module.exports = {
  presets: [require.resolve('@babel/preset-env')],
  plugins: [require.resolve('@babel/plugin-transform-flow-strip-types')],
};
