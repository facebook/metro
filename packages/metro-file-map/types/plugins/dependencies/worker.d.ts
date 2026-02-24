/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<2e845e8720ef0522a5d4c30c30402f20>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/plugins/dependencies/worker.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {
  MetadataWorker,
  V8Serializable,
  WorkerMessage,
} from '../../flow-types';

declare class DependencyExtractorWorker implements MetadataWorker {
  constructor(opts: Readonly<{dependencyExtractor: null | undefined | string}>);
  processFile(
    data: WorkerMessage,
    utils: Readonly<{getContent: () => Buffer}>,
  ): V8Serializable;
}
export = DependencyExtractorWorker;
