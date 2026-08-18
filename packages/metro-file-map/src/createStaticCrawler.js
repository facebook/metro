/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import type {CrawlerFactory, FileData, FileMetadata} from './flow-types';

import {RootPathUtils} from './lib/RootPathUtils';
import * as path from 'node:path';

export type StaticFile = Readonly<{
  /**
   * An absolute path, or a path relative to the `FileMap`'s `rootDir`, using
   * system separators.
   */
  path: string,

  /**
   * Per-file plugin data, keyed by plugin `name` - e.g. `{haste: 'MyModule'}`
   * for `HastePlugin`. Entries for plugins that aren't registered on the
   * `FileMap`, or that declare no worker, are ignored.
   *
   * NOTE: Unlike a filesystem crawl, where plugin data is computed by a worker
   * subject to that plugin's own `filter`, data supplied here is taken as-is.
   * In particular `HastePlugin` will register Haste IDs given for files under
   * `node_modules`, which it would never do when crawling. Callers are
   * responsible for only supplying data they want registered.
   */
  pluginData?: ?Readonly<{[pluginName: string]: unknown}>,
}>;

export type StaticCrawlerOptions = Readonly<{
  /**
   * An array rather than an `Iterable`, because the returned crawler walks it
   * on every crawl - including a `recrawl` in watch mode - and a single-use
   * iterable would report an empty listing on the second pass.
   */
  files: ReadonlyArray<StaticFile>,
}>;

/**
 * A `CrawlerFactory` backed by a known set of files, for consumers that already
 * have a complete file listing and per-file plugin data (e.g. Haste IDs), and
 * therefore need neither a filesystem crawl nor the `FileProcessor`.
 *
 * Files are reported as already visited (`H.VISITED`), never symlinks, with
 * unknown mtime, zero size and no SHA-1, so `metro-file-map` performs no file
 * reads and starts no workers for them.
 *
 * The listing is fixed, so every crawl reports the same set and never reports
 * removals. Watching such a `FileMap` is possible but pointless, since nothing
 * the crawler reports can ever change.
 */
export default function createStaticCrawler({
  files,
}: StaticCrawlerOptions): CrawlerFactory {
  return ({pluginDataIndices}) =>
    async ({rootDir}) => {
      const pathUtils = new RootPathUtils(rootDir);
      const changedFiles: FileData = new Map();

      for (const file of files) {
        const metadata: FileMetadata = [
          /* mtime */ null,
          /* size */ 0,
          /* visited */ 1,
          /* sha1 */ null,
          /* symlink */ 0,
        ];
        const pluginData = file.pluginData;
        if (pluginData != null) {
          for (const [pluginName, dataIdx] of pluginDataIndices) {
            const value = pluginData[pluginName];
            if (value != null) {
              // `FileMetadata` is a tuple type, so Flow rejects a write at an
              // index only known at runtime. Slots are allocated by `FileMap`.
              Reflect.set(metadata, dataIdx, value);
            }
          }
        }
        changedFiles.set(
          path.isAbsolute(file.path)
            ? pathUtils.absoluteToNormal(file.path)
            : pathUtils.relativeToNormal(file.path),
          metadata,
        );
      }

      return {changedFiles, removedFiles: new Set<string>()};
    };
}
