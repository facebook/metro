/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<5152d1919d3373e4df611e0fca805e1c>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/watchers/FallbackWatcher.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import {AbstractWatcher} from './AbstractWatcher';

declare class FallbackWatcher extends AbstractWatcher {
  startWatching(): Promise<void>;
  /**
   * End watching.
   */
  stopWatching(): Promise<void>;
  getPauseReason(): null | undefined | string;
}
export default FallbackWatcher;
