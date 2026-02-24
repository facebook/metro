/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<1e0fa2d1bab2971504a4c271d453dc29>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-resolver/src/errors/FailedToResolvePathError.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {FileAndDirCandidates} from '../types';

declare class FailedToResolvePathError extends Error {
  candidates: FileAndDirCandidates;
  constructor(candidates: FileAndDirCandidates);
}
export default FailedToResolvePathError;
