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
declare function mergeConfig<T extends Readonly<InputConfigT>>(
  defaultConfig: T,
  ...configs: Array<InputConfigT>
): T;
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
