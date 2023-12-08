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

const path = require('path');

require('eslint-plugin-lint').load(path.join(__dirname, 'rules'));

/**
 * Base ESLint config for JavaScript and Flow source code.
 */
module.exports = {
  env: {
    node: true,
  },
  root: true,
  extends: ['eslint-config-fb-strict', 'plugin:prettier/recommended'],
  plugins: ['babel', 'ft-flow', 'import', 'lint', 'prettier'],
  parser: 'hermes-eslint',
  rules: {
    'babel/quotes': ['error', 'single', 'avoid-escape'],
    'consistent-return': 'error',
    'import/no-extraneous-dependencies': 'error',
    'lint/extra-arrow-initializer': 'off',
    'lint/sort-imports': 'warn',
    'lint/strictly-null': 'warn',
    'max-len': 'off',
    'no-alert': 'error',
    'no-console': 'error',
    'no-unused-vars': 'error',
    'no-var': 'off',
    'prefer-const': ['warn', {destructuring: 'all'}],
    quotes: 'off',
    'sort-keys': 'off',

    // prettier handles this
    'flowtype/object-type-delimiter': 'off',
    'ft-flow/object-type-delimiter': 'off',

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
