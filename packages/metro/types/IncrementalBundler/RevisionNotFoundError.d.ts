/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<2c2d4a1a2d357eb73806a68bba897795>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/IncrementalBundler/RevisionNotFoundError.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {RevisionId} from '../IncrementalBundler';

declare class RevisionNotFoundError extends Error {
  revisionId: RevisionId;
  constructor(revisionId: RevisionId);
}
export default RevisionNotFoundError;
