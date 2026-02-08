/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {RamBundleInfo} from '../../DeltaBundler/Serializers/getRamBundleInfo';
import type {OutputOptions, RequestOptions} from '../types';

import Server from '../../Server';

export declare function build(
  packagerClient: Server,
  requestOptions: RequestOptions,
): Promise<RamBundleInfo>;
export declare function save(
  bundle: RamBundleInfo,
  options: OutputOptions,
  log: (x: string) => void,
): Promise<unknown>;
export declare const formatName: 'bundle';
export declare type formatName = typeof formatName;
