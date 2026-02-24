/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<d9877b2ba27e8e3f279901c80c7ad895>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/shared/output/bundle.flow.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
