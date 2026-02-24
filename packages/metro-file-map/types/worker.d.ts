/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @generated SignedSource<<40f8f3a5c3f7effaaada900336673157>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/worker.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {
  WorkerMessage,
  WorkerMetadata,
  WorkerSetupArgs,
} from './flow-types';

declare const worker: {
  /**
   * Called automatically by jest-worker before the first call to `worker` when
   * this module is used as worker thread or child process.
   */
  setup: (args: WorkerSetupArgs) => void;
  /**
   * Called by jest-worker with each workload
   */
  processFile: (data: WorkerMessage) => WorkerMetadata;
  /**
   * Exposed for use outside a jest-worker context, ie when processing in-band.
   */
  Worker: {
    new (setupArgs: WorkerSetupArgs): {
      processFile(data: WorkerMessage): WorkerMetadata;
    };
  };
};

export = worker;
