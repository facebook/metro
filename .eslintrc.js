/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const path = require('path');

require('eslint-plugin-lint').load(path.join(__dirname, 'eslint-rules'));

module.exports = {
  env: {
    node: true,
  },
  extends: 'eslint-config-fb-strict',
  plugins: ['babel', 'flowtype', 'import', 'lint', 'prettier'],
  parser: 'babel-eslint',
  rules: {
    'babel/quotes': ['error', 'single', 'avoid-escape'],
    'consistent-return': 'error',
    'import/no-extraneous-dependencies': 'error',
    'lint/extra-arrow-initializer': 'off',
    'lint/strictly-null': 'warn',
    'max-len': 'off',
    'no-alert': 'error',
    'no-console': 'error',
    'no-unused-vars': 'error',
    'no-var': 'off',
    'prefer-arrow-callback': 'off',
    'prefer-const': ['warn', {destructuring: 'all'}],
    'prettier/prettier': ['error', 'fb', '@format'],
    'sort-keys': 'off',
    'flowtype/object-type-delimiter': 'off',
  },
  overrides: [
    {
      files: ['packages/metro-source-map/**/*.js'],
      rules: {
        'operator-assignment': ['error', 'never'],
      },
      env: {
        node: true,
      },
    },
    {
      files: ['scripts/**/*.js'],
      rules: {
        'babel/func-params-comma-dangle': 'off',
        'import/no-extraneous-dependencies': 'off',
      },
    },
  ],
};
