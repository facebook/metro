/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
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
