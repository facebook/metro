/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 */

// Partial typings for babel-plugin-tester. Add APIs as you need them.

declare module 'babel-plugin-tester' {
  import typeof * as Babel from '@babel/core';
  import type {BabelCoreOptions, PluginObj} from '@babel/core';

  declare type PluginTesterOptions<TOpts = mixed, TState = mixed> = {
    babelOptions?: BabelCoreOptions,
    plugin: (babel: Babel) => PluginObj<TState>,
    pluginOptions?: TOpts,
    tests: $ReadOnly<{
      [title: string]: $ReadOnly<{
        code: string,
        output?: string,
        error?: string,
        snapshot?: boolean,
        ...
      }>,
    }>,
  };

  declare function pluginTester<TOpts = mixed, TState = mixed>(
    opts: PluginTesterOptions<TOpts, TState>,
  ): void;

  declare module.exports: typeof pluginTester;
}
