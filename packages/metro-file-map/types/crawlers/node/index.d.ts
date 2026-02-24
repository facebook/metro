/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<8851cd12d3cd8bdda798362696c830a2>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/crawlers/node/index.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {CanonicalPath, CrawlerOptions, FileData} from '../../flow-types';

declare function nodeCrawl(
  options: CrawlerOptions,
): Promise<{removedFiles: Set<CanonicalPath>; changedFiles: FileData}>;
export default nodeCrawl;
