/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
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
  root: true,
  extends: ['eslint-config-fb-strict', 'plugin:prettier/recommended'],
  plugins: ['babel', 'flowtype', 'import', 'lint', 'prettier'],
  parser: 'hermes-eslint',
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
    'prefer-const': ['warn', {destructuring: 'all'}],
    quotes: 'off',
    'sort-keys': 'off',
    'flowtype/object-type-delimiter': 'off',

    // These rules are not required with hermes-eslint
    'ft-flow/define-flow-type': 0,
    'ft-flow/use-flow-type': 0,
    'flowtype/define-flow-type': 0,
    'flowtype/use-flow-type': 0,
    // flow handles this check for us, so it's not required
    'no-undef': 0,
  },
  overrides: [
    {
      files: ['flow-typed/**/*.js'],
      rules: {
        'babel/quotes': 'off',
        'lint/flow-function-shape': 'off',
      },
    },
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
    {
      files: ['**/__tests__/**/*.js'],
      env: {
        jest: true,
      },
      rules: {
        'babel/quotes': [
          'error',
          'single',
          {avoidEscape: true, allowTemplateLiterals: true},
        ],
        quotes: 'off',
      },
    },
  ],
};
