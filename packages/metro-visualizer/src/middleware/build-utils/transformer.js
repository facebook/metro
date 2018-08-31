/**
 * Copyright (c) 2015-present, Facebook, Inc.
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
    presets: ['@babel/env', '@babel/preset-react', '@babel/preset-flow'],
    plugins: [
      '@babel/plugin-proposal-class-properties',
      [
        'import',
        {
          libraryName: 'antd',
          style: false,
        },
      ],
    ],
  });
};
