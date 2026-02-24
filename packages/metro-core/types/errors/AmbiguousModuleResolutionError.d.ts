/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<7a75db672d30c9ee9eb88666b881b3f6>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-core/src/errors/AmbiguousModuleResolutionError.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {DuplicateHasteCandidatesError} from 'metro-file-map';

declare class AmbiguousModuleResolutionError extends Error {
  fromModulePath: string;
  hasteError: DuplicateHasteCandidatesError;
  constructor(
    fromModulePath: string,
    hasteError: DuplicateHasteCandidatesError,
  );
}
export default AmbiguousModuleResolutionError;
