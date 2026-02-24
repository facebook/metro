/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<53c103ffe2115282c4d72593f47018aa>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/plugins/haste/HasteConflictsError.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {HasteConflict} from '../../flow-types';

export declare class HasteConflictsError extends Error {
  constructor(conflicts: ReadonlyArray<HasteConflict>);
  getDetailedMessage(pathsRelativeToRoot: null | undefined | string): string;
}
