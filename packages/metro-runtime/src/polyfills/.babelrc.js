/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

module.exports = {
  plugins: [
    require.resolve('@babel/plugin-transform-flow-strip-types'),
    require.resolve('@babel/plugin-proposal-nullish-coalescing-operator'),
    require.resolve('@babel/plugin-proposal-optional-chaining'),
  ],
};
