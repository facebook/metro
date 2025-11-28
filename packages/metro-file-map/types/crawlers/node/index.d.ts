/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {CanonicalPath, CrawlerOptions, FileData} from '../../flow-types';

declare function nodeCrawl(
  options: CrawlerOptions,
): Promise<{removedFiles: Set<CanonicalPath>; changedFiles: FileData}>;
export default nodeCrawl;
