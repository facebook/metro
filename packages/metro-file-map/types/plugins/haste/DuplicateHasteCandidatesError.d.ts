/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<2c991103bc4a71a81ef04de0884de576>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/plugins/haste/DuplicateHasteCandidatesError.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {DuplicatesSet} from '../../flow-types';

export declare class DuplicateHasteCandidatesError extends Error {
  hasteName: string;
  platform: string | null;
  supportsNativePlatform: boolean;
  duplicatesSet: DuplicatesSet;
  constructor(
    name: string,
    platform: string,
    supportsNativePlatform: boolean,
    duplicatesSet: DuplicatesSet,
  );
}
