/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {ConfigT, InputConfigT, YargArguments} from './configTypes';

export interface CosmiConfigResult {
  filepath: string;
  isEmpty: boolean;
  config:
    | ((partialConfig: ConfigT) => Promise<ConfigT>)
    | ((partialConfig: ConfigT) => ConfigT)
    | InputConfigT;
}

export function loadConfig(
  argv?: YargArguments,
  defaultConfigOverrides?: InputConfigT,
): Promise<ConfigT>;

export function resolveConfig(
  filePath?: string,
  cwd?: string,
): Promise<CosmiConfigResult>;

export function mergeConfig(
  defaultConfig: InputConfigT,
  ...configs: InputConfigT[]
): ConfigT;
