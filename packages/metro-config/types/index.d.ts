/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import getDefaultConfig from './defaults';
import {loadConfig, mergeConfig, resolveConfig} from './loadConfig';

export * from './configTypes';
export {loadConfig, mergeConfig, resolveConfig, getDefaultConfig};
