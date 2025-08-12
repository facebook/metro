/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

let plugins;
try {
  plugins = [
    require.resolve(
      '../../../../tools/third-party/prettier/node_modules/prettier-plugin-hermes-parser/index.mjs',
    ),
  ];
} catch {
  plugins = ['prettier-plugin-hermes-parser'];
}

module.exports = {
  arrowParens: 'avoid',
  bracketSameLine: true,
  bracketSpacing: false,
  requirePragma: true,
  singleQuote: true,
  trailingComma: 'all',
  plugins,
  overrides: [
    {
      files: ['*.js', '*.flow'],
      options: {
        parser: 'hermes',
      },
    },
  ],
};
