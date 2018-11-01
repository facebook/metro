/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const {transform} = require('@babel/core');

module.exports.transform = file => {
  return transform(file.src, {
    ast: true,
    babelrc: false,
    configFile: false,
    presets: [
      require.resolve('@babel/preset-env'),
      require.resolve('@babel/preset-react'),
      require.resolve('@babel/preset-flow'),
    ],
    plugins: [
      require.resolve('@babel/plugin-proposal-class-properties'),
      [
        require.resolve('babel-plugin-import'),
        {
          libraryName: 'antd',
          style: false,
        },
      ],
    ],
  });
};
