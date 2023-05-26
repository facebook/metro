/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

export interface AssetDataWithoutFiles {
  readonly __packager_asset: boolean;
  readonly fileSystemLocation: string;
  readonly hash: string;
  readonly height?: number;
  readonly httpServerLocation: string;
  readonly name: string;
  readonly scales: number[];
  readonly type: string;
  readonly width?: number;
}

export interface AssetData extends AssetDataWithoutFiles {
  readonly files: string[];
}
