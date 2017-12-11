/**
 * Copyright 2004-present Facebook. All Rights Reserved.
 *
 * @format
 */
'use strict';

module.exports = {
  env: {
    node: true,
  },
  extends: 'eslint-config-fb-strict',
  plugins: ['babel', 'flowtype', 'prettier'],
  parser: 'babel-eslint',
  rules: {
    'extra-arrow-initializer': 'off',
    'max-len': 'off',
    'no-alert': 'off',
    'no-console-disallow': 'off',
    'no-var': 'off',
    'prefer-arrow-callback': 'off',
    'prefer-const': ['warn', {destructuring: 'all'}],
    'prettier/prettier': ['error', 'fb', '@format'],
    'sort-keys': 'off',
  },
};
