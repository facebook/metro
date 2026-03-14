/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<bcfb58810773510450845bc00a93beae>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/crawlers/watchman/index.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {CrawlerOptions, CrawlResult} from '../../flow-types';

declare function watchmanCrawl(
  $$PARAM_0$$: CrawlerOptions,
): Promise<CrawlResult>;
export default watchmanCrawl;
