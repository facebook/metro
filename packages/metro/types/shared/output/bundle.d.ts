/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import {OutputOptions, RequestOptions} from '../../shared/types';
import Server from '../../Server';

export function build(
  packagerClient: Server,
  requestOptions: RequestOptions,
): Promise<{
  code: string;
  map: string;
}>;

export function save(
  bundle: {
    code: string;
    map: string;
  },
  options: OutputOptions,
  log: (...args: string[]) => void,
): Promise<unknown>;

export const formatName: string;
