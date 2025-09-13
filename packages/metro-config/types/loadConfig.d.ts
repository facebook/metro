/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {ConfigT, InputConfigT, YargArguments} from './types';

type ResolveConfigResult = {
  filepath: string;
  isEmpty: boolean;
  config:
    | ((baseConfig: ConfigT) => Promise<ConfigT>)
    | ((baseConfig: ConfigT) => ConfigT)
    | InputConfigT;
};
declare function resolveConfig(
  filePath?: string,
  cwd?: string,
): Promise<ResolveConfigResult>;
/**
 * Merge two or more partial config objects (or functions returning partial
 * configs) together, with arguments to the right overriding the left.
 *
 * Functions will be parsed the current config (the merge of all configs to the
 * left).
 *
 * Functions may be async, in which case this function will return a promise.
 * Otherwise it will return synchronously.
 */
declare function mergeConfig<
  T extends InputConfigT,
  R extends ReadonlyArray<
    | InputConfigT
    | ((baseConfig: T) => InputConfigT)
    | ((baseConfig: T) => Promise<InputConfigT>)
  >,
>(
  base: T | (() => T),
  ...configs: R
): R extends ReadonlyArray<InputConfigT | ((baseConfig: T) => InputConfigT)>
  ? T
  : Promise<T>;
/**
 * Load the metro configuration from disk
 * @param  {object} argv                    Arguments coming from the CLI, can be empty
 * @param  {object} defaultConfigOverrides  A configuration that can override the default config
 * @return {object}                         Configuration returned
 */
declare function loadConfig(
  argvInput?: YargArguments,
  defaultConfigOverrides?: InputConfigT,
): Promise<ConfigT>;
export declare function loadConfigFile(
  absolutePath: string,
): Promise<ResolveConfigResult>;
export {loadConfig, resolveConfig, mergeConfig};
