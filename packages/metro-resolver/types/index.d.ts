/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<c26a662896a7bf2992a47a7daf457cbf>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-resolver/src/index.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

export type {
  AssetFileResolution,
  CustomResolutionContext,
  CustomResolver,
  CustomResolverOptions,
  DoesFileExist,
  FileAndDirCandidates,
  FileCandidates,
  FileResolution,
  FileSystemLookup,
  ResolutionContext,
  Resolution,
  ResolveAsset,
  Result,
} from './types';
import FailedToResolveNameError from './errors/FailedToResolveNameError';
import FailedToResolvePathError from './errors/FailedToResolvePathError';
import FailedToResolveUnsupportedError from './errors/FailedToResolveUnsupportedError';
import formatFileCandidates from './errors/formatFileCandidates';
import InvalidPackageError from './errors/InvalidPackageError';
import resolve from './resolve';

export {
  FailedToResolveNameError,
  FailedToResolvePathError,
  FailedToResolveUnsupportedError,
  formatFileCandidates,
  InvalidPackageError,
  resolve,
};
/**
 * Backwards-compatibility with CommonJS consumers using interopRequireDefault.
 * Do not add to this list.
 *
 * @deprecated Default import from 'metro-resolver' is deprecated, use named exports.
 */
declare const $$EXPORT_DEFAULT_DECLARATION$$: {
  FailedToResolveNameError: typeof FailedToResolveNameError;
  FailedToResolvePathError: typeof FailedToResolvePathError;
  FailedToResolveUnsupportedError: typeof FailedToResolveUnsupportedError;
  formatFileCandidates: typeof formatFileCandidates;
  InvalidPackageError: typeof InvalidPackageError;
  resolve: typeof resolve;
};
declare type $$EXPORT_DEFAULT_DECLARATION$$ =
  typeof $$EXPORT_DEFAULT_DECLARATION$$;
export default $$EXPORT_DEFAULT_DECLARATION$$;
