/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

'use strict';

export type {
  AssetFileResolution,
  CustomResolutionContext,
  CustomResolver,
  CustomResolverOptions,
  DoesFileExist,
  FileAndDirCandidates,
  FileCandidates,
  FileResolution,
  IsAssetFile,
  ResolutionContext,
  Resolution,
  ResolveAsset,
  Result,
} from './types';

const Resolver = {
  FailedToResolveNameError: require('./FailedToResolveNameError'),
  FailedToResolvePathError: require('./FailedToResolvePathError'),
  formatFileCandidates: require('./formatFileCandidates'),
  InvalidPackageError: require('./InvalidPackageError'),
  resolve: require('./resolve'),
};

module.exports = Resolver;
