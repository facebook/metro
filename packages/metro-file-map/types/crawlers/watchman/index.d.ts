/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
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
