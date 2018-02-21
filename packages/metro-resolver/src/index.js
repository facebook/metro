/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

export type {
  DoesFileExist,
  IsAssetFile,
  ResolutionContext,
  ResolveAsset,
} from './resolve';
export type {
  AssetFileResolution,
  Candidates,
  FileAndDirCandidates,
  FileCandidates,
  FileResolution,
  Resolution,
  Result,
} from './types';

const Resolver = {
  resolve: require('./resolve'),
  InvalidPackageError: require('./InvalidPackageError'),
  formatFileCandidates: require('./formatFileCandidates'),
};

module.exports = Resolver;
