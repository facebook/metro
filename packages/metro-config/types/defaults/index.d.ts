/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {ConfigT} from '../configTypes';

export default interface getDefaultConfig {
  (rootPath: string | null): Promise<ConfigT>;
  getDefaultValues: (rootPath: string | null) => ConfigT;
}
