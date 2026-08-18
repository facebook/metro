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

import type {
  Crawler,
  CrawlerOptions,
  CrawlResult,
  FileData,
  FileMetadata,
} from '../flow-types';

import TreeFS from '../lib/TreeFS';
import {Watcher} from '../Watcher';
import * as path from 'node:path';

const mockWatchmanCrawl = jest.fn<[CrawlerOptions], Promise<CrawlResult>>();
const mockNodeCrawl = jest.fn<[CrawlerOptions], Promise<CrawlResult>>();
jest.mock(
  '../crawlers/watchman',
  () => (options: CrawlerOptions) => mockWatchmanCrawl(options),
);
jest.mock(
  '../crawlers/node',
  () => (options: CrawlerOptions) => mockNodeCrawl(options),
);

const rootDir = path.join(path.sep, 'project');

function crawlResult(canonicalPaths: ReadonlyArray<string>): CrawlResult {
  const changedFiles: FileData = new Map();
  for (const canonicalPath of canonicalPaths) {
    const metadata: FileMetadata = [
      /* mtime */ null,
      /* size */ 0,
      /* visited */ 1,
      /* sha1 */ null,
      /* symlink */ 0,
    ];
    changedFiles.set(canonicalPath, metadata);
  }
  return {changedFiles, removedFiles: new Set<string>()};
}

const rejectWith =
  (message: string): (() => Promise<CrawlResult>) =>
  async () => {
    throw new Error(message);
  };

function createWatcher(useWatchman: boolean, crawl?: ?Crawler): Watcher {
  return new Watcher({
    abortSignal: new AbortController().signal,
    computeSha1: false,
    console: global.console,
    crawl,
    enableSymlinks: false,
    extensions: ['js'],
    healthCheckFilePrefix: '.metro-file-map-health-check',
    ignoreForCrawl: () => false,
    ignorePatternForWatch: /^$/,
    perfLogger: null,
    previousState: {
      clocks: new Map(),
      fileSystem: new TreeFS({
        processFile: () => {
          throw new Error('not implemented');
        },
        rootDir,
      }),
    },
    rootDir,
    roots: [rootDir],
    useWatchman,
    watch: false,
    watchmanDeferStates: [],
  });
}

beforeEach(() => {
  mockWatchmanCrawl.mockReset();
  mockNodeCrawl.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Watcher crawl fallback', () => {
  test('the node crawler runs directly when Watchman is not preferred', async () => {
    const canonicalPath = path.join('src', 'index.js');
    mockNodeCrawl.mockImplementation(async () => crawlResult([canonicalPath]));

    const result = await createWatcher(false).crawl();

    expect([...result.changedFiles.keys()]).toEqual([canonicalPath]);
    expect(mockNodeCrawl).toHaveBeenCalledTimes(1);
    expect(mockWatchmanCrawl).not.toHaveBeenCalled();
  });

  test('a failing node crawler propagates, with no retry', async () => {
    mockNodeCrawl.mockImplementation(rejectWith('node crawl failed'));

    await expect(createWatcher(false).crawl()).rejects.toThrow(
      'node crawl failed',
    );
    // The retry exists for Watchman only - retrying node with node is pointless.
    expect(mockNodeCrawl).toHaveBeenCalledTimes(1);
  });

  test('a successful Watchman crawl does not touch the node crawler', async () => {
    const canonicalPath = path.join('src', 'index.js');
    mockWatchmanCrawl.mockImplementation(async () =>
      crawlResult([canonicalPath]),
    );

    const result = await createWatcher(true).crawl();

    expect([...result.changedFiles.keys()]).toEqual([canonicalPath]);
    expect(mockWatchmanCrawl).toHaveBeenCalledTimes(1);
    expect(mockNodeCrawl).not.toHaveBeenCalled();
  });

  test('a failing Watchman crawl falls back to the node crawler', async () => {
    const canonicalPath = path.join('src', 'index.js');
    mockWatchmanCrawl.mockImplementation(rejectWith('watchman unavailable'));
    mockNodeCrawl.mockImplementation(async () => crawlResult([canonicalPath]));

    const result = await createWatcher(true).crawl();

    expect([...result.changedFiles.keys()]).toEqual([canonicalPath]);
    expect(mockNodeCrawl).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalled();
  });

  test('when both crawlers fail, the error names each failure', async () => {
    mockWatchmanCrawl.mockImplementation(rejectWith('watchman unavailable'));
    mockNodeCrawl.mockImplementation(rejectWith('node crawl failed'));

    const thrown = await createWatcher(true)
      .crawl()
      .then(
        () => null,
        (error: Error) => error,
      );

    expect(thrown?.message).toContain('Crawler retry failed');
    expect(thrown?.message).toContain('watchman unavailable');
    expect(thrown?.message).toContain('node crawl failed');
  });

  test('the fallback re-crawls with the same options', async () => {
    mockWatchmanCrawl.mockImplementation(rejectWith('watchman unavailable'));
    mockNodeCrawl.mockImplementation(async () => crawlResult([]));

    await createWatcher(true).crawl();

    expect(mockNodeCrawl.mock.calls[0][0]).toBe(
      mockWatchmanCrawl.mock.calls[0][0],
    );
  });
});

describe('Watcher crawl option', () => {
  const stubCrawler =
    (canonicalPaths: ReadonlyArray<string>): Crawler =>
    async () =>
      crawlResult(canonicalPaths);

  test('crawls with the supplied crawler instead of the built-ins', async () => {
    const canonicalPath = path.join('src', 'index.js');

    const result = await createWatcher(
      true,
      stubCrawler([canonicalPath]),
    ).crawl();

    expect([...result.changedFiles.keys()]).toEqual([canonicalPath]);
    expect(mockWatchmanCrawl).not.toHaveBeenCalled();
    expect(mockNodeCrawl).not.toHaveBeenCalled();
  });

  test('passes the standard crawler options through', async () => {
    const crawl = jest.fn<[CrawlerOptions], Promise<CrawlResult>>(
      stubCrawler([]),
    );

    await createWatcher(true, crawl).crawl();

    const options = crawl.mock.calls[0][0];
    expect(options).toMatchObject({
      computeSha1: false,
      extensions: ['js'],
      rootDir,
      roots: [rootDir],
    });
    expect(typeof options.ignore).toBe('function');
    expect(typeof options.onStatus).toBe('function');
    expect(options.abortSignal).toBeInstanceOf(AbortSignal);
    expect(options.previousState.fileSystem).toBeDefined();
  });

  test('is also used for a scoped recrawl, and receives its subpath', async () => {
    const crawl = jest.fn<[CrawlerOptions], Promise<CrawlResult>>(
      stubCrawler([]),
    );
    const fileSystem = new TreeFS({
      processFile: () => {
        throw new Error('not implemented');
      },
      rootDir,
    });

    await createWatcher(true, crawl).recrawl(
      path.join('src', 'nested'),
      fileSystem,
    );

    expect(crawl).toHaveBeenCalledTimes(1);
    expect(crawl.mock.calls[0][0]).toMatchObject({
      roots: [path.join(rootDir, 'src', 'nested')],
      subpath: path.join('src', 'nested'),
    });
  });

  test('failures are fatal, with no fallback to the node crawler', async () => {
    // Falling back would silently crawl the real filesystem, which is exactly
    // what a supplied crawler exists to avoid.
    const crawl: Crawler = rejectWith('crawler exploded');

    await expect(createWatcher(true, crawl).crawl()).rejects.toThrow(
      'crawler exploded',
    );
    expect(mockNodeCrawl).not.toHaveBeenCalled();
  });
});
