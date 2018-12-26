/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */
'use strict';

/* import type {BabelCoreOptions} from '@babel/core'; */

module.exports = function(api /*: any */) /*: BabelCoreOptions */ {
  api.cache.never();

  const plugins = [
    '@babel/plugin-proposal-object-rest-spread',
    '@babel/plugin-transform-async-to-generator',
    '@babel/plugin-transform-destructuring',
    '@babel/plugin-transform-flow-strip-types',
    '@babel/plugin-syntax-dynamic-import',

    // TODO: Check if plugins from the list below are actually in use
    '@babel/plugin-proposal-class-properties',
    '@babel/plugin-transform-modules-commonjs',
    '@babel/plugin-transform-parameters',
    '@babel/plugin-transform-react-jsx',
    '@babel/plugin-transform-spread',
  ];

  return {
    babelrcRoots: ['.', 'packages/*'],
    plugins: plugins.map(plugin => require.resolve(plugin)),
  };
};
