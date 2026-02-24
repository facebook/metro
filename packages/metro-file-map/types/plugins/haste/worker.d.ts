/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @generated SignedSource<<150098cafadeebb35978352da302d211>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/plugins/haste/worker.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {
  MetadataWorker,
  V8Serializable,
  WorkerMessage,
} from '../../flow-types';

declare class Worker implements MetadataWorker {
  constructor(opts: Readonly<{hasteImplModulePath: null | undefined | string}>);
  processFile(
    data: WorkerMessage,
    utils: Readonly<{getContent: () => Buffer}>,
  ): V8Serializable;
}

export = Worker;
