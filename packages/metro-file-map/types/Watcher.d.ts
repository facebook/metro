/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

export type HealthCheckResult =
  | {type: 'error'; timeout: number; error: Error; watcher: string | null}
  | {
      type: 'success';
      timeout: number;
      timeElapsed: number;
      watcher: string | null;
    }
  | {
      type: 'timeout';
      timeout: number;
      watcher: string | null;
      pauseReason: string | null;
    };
