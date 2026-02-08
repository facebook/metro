/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {AssetData} from '../../Assets';
import type {BuildOptions, OutputOptions, RequestOptions} from '../types';

import Server from '../../Server';

export declare function build(
  packagerClient: Server,
  requestOptions: RequestOptions,
  buildOptions?: BuildOptions,
): Promise<{code: string; map: string; assets?: ReadonlyArray<AssetData>}>;
export declare function save(
  bundle: {code: string; map: string},
  options: OutputOptions,
  log: ($$PARAM_0$$: string) => void,
): Promise<unknown>;
export declare const formatName: 'bundle';
export declare type formatName = typeof formatName;
