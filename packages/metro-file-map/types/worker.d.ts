/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import type {
  WorkerMessage,
  WorkerMetadata,
  WorkerSetupArgs,
} from './flow-types';

export declare class Worker {
  constructor(args: WorkerSetupArgs);
  processFile(data: WorkerMessage): WorkerMetadata;
}
export declare function setup(args: WorkerSetupArgs): void;
export declare function processFile(data: WorkerMessage): WorkerMetadata;
declare const $$EXPORT_DEFAULT_DECLARATION$$: {
  /**
   * Called automatically by jest-worker before the first call to `worker` when
   * this module is used as worker thread or child process.
   */
  setup: typeof setup;
  /**
   * Called by jest-worker with each workload
   */
  processFile: typeof processFile;
  /**
   * Exposed for use outside a jest-worker context, ie when processing in-band.
   */
  Worker: typeof Worker;
};
declare type $$EXPORT_DEFAULT_DECLARATION$$ =
  typeof $$EXPORT_DEFAULT_DECLARATION$$;
export default $$EXPORT_DEFAULT_DECLARATION$$;
