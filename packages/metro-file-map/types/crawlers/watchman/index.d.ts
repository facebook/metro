/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<94c8a03429d06b694e26ca524fb9f17c>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/crawlers/watchman/index.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {
  CanonicalPath,
  CrawlerOptions,
  FileData,
  WatchmanClocks,
} from '../../flow-types';

declare function watchmanCrawl($$PARAM_0$$: CrawlerOptions): Promise<{
  changedFiles: FileData;
  removedFiles: Set<CanonicalPath>;
  clocks: WatchmanClocks;
}>;
export default watchmanCrawl;
