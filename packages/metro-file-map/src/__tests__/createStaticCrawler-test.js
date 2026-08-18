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

import type {Crawler, CrawlerOptions, InputOptions, StaticFile} from '../index';
import typeof * as AbstractWatcherModule from '../watchers/AbstractWatcher';

import FileMap, {
  HastePlugin,
  NoopCacheManager,
  createStaticCrawler,
} from '../index';
import {FileProcessor} from '../lib/FileProcessor';
import * as path from 'node:path';

// Hoisted above the imports by jest, so the backend class has to be built
// inside the factory.
function mockCreateWatcherBackend() {
  const {AbstractWatcher} = jest.requireActual<AbstractWatcherModule>(
    '../watchers/AbstractWatcher',
  );
  return class MockWatcherBackend extends AbstractWatcher {
    static isSupported(): boolean {
      return true;
    }
  };
}

jest.mock('../watchers/FallbackWatcher', () => mockCreateWatcherBackend());
jest.mock('../watchers/NativeWatcher', () => mockCreateWatcherBackend());
jest.mock('../watchers/WatchmanWatcher', () => mockCreateWatcherBackend());

jest.mock('../crawlers/watchman', () => () => {
  throw new Error('watchmanCrawl must not be called');
});
jest.mock('../crawlers/node', () => () => {
  throw new Error('nodeCrawl must not be called');
});

const rootDir = path.join(path.sep, 'project');
const p = (...parts: Array<string>) => path.join(rootDir, ...parts);

function createFileMap(
  files: Array<StaticFile>,
  overrides?: Partial<InputOptions>,
): {fileMap: FileMap, hastePlugin: HastePlugin} {
  const hastePlugin = new HastePlugin({
    enableHastePackages: true,
    failValidationOnConflicts: false,
    hasteImplModulePath: null,
    perfLogger: null,
    platforms: new Set(['ios', 'android', 'native']),
    rootDir,
  });
  const fileMap = new FileMap({
    cacheManagerFactory: () => new NoopCacheManager(),
    crawlerFactory: createStaticCrawler({files}),
    extensions: ['js', 'json'],
    healthCheck: {enabled: false, filePrefix: '', interval: 0, timeout: 0},
    maxWorkers: 1,
    plugins: [hastePlugin],
    retainAllFiles: true,
    rootDir,
    roots: [rootDir],
    useWatchman: false,
    watch: false,
    ...overrides,
  });
  return {fileMap, hastePlugin};
}

describe('createStaticCrawler', () => {
  test('builds a FileSystem from the supplied listing', async () => {
    const {fileMap} = createFileMap([
      {path: 'src/index.js'},
      {path: 'src/nested/other.js'},
      {path: p('absolute.js')},
    ]);

    const {fileSystem} = await fileMap.build();

    expect(fileSystem.exists(p('src', 'index.js'))).toBe(true);
    expect(fileSystem.exists(p('src', 'nested', 'other.js'))).toBe(true);
    expect(fileSystem.exists(p('absolute.js'))).toBe(true);
    expect(fileSystem.exists(p('src', 'missing.js'))).toBe(false);
    expect(fileSystem.lookup(p('src'))).toMatchObject({
      exists: true,
      type: 'd',
    });
  });

  test('populates HastePlugin from per-file plugin data', async () => {
    const {fileMap, hastePlugin} = createFileMap([
      {path: 'src/Thing.js', pluginData: {haste: 'Thing'}},
      {path: 'src/Thing.ios.js', pluginData: {haste: 'Thing'}},
      {path: 'src/NoHaste.js'},
      {path: 'pkg/package.json', pluginData: {haste: 'HastePkg'}},
    ]);

    await fileMap.build();

    expect(hastePlugin.getModule('Thing', null, false)).toBe(
      p('src', 'Thing.js'),
    );
    expect(hastePlugin.getModule('Thing', 'ios', false)).toBe(
      p('src', 'Thing.ios.js'),
    );
    expect(hastePlugin.getModule('NoHaste', null, false)).toBeNull();
    expect(hastePlugin.getPackage('HastePkg', null, false)).toBe(
      p('pkg', 'package.json'),
    );
    expect(hastePlugin.getModuleNameByPath(p('src', 'Thing.js'))).toBe('Thing');
  });

  test('does not process any file contents', async () => {
    const processBatch = jest.spyOn(FileProcessor.prototype, 'processBatch');
    const {fileMap} = createFileMap([
      {path: 'src/index.js', pluginData: {haste: 'Index'}},
    ]);

    await fileMap.build();

    expect(processBatch).toHaveBeenCalledTimes(1);
    expect(processBatch.mock.calls[0][0]).toEqual([]);
    processBatch.mockRestore();
  });

  test('supplied plugin data is registered as-is, including under node_modules', async () => {
    // Unlike a crawl, where HastePlugin's worker filter excludes node_modules,
    // data supplied here is taken at face value. Callers must filter for
    // themselves.
    const {fileMap, hastePlugin} = createFileMap([
      {path: 'node_modules/pkg/Thing.js', pluginData: {haste: 'Thing'}},
    ]);

    await fileMap.build();

    expect(hastePlugin.getModule('Thing', null, false)).toBe(
      p('node_modules', 'pkg', 'Thing.js'),
    );
  });

  test('reports the same listing on every crawl', async () => {
    // The crawler is invoked again for a recrawl, so the listing must survive
    // more than one pass - a single-use iterable would report nothing the
    // second time.
    const staticFactory = createStaticCrawler({
      files: [{path: 'src/Thing.js', pluginData: {haste: 'Thing'}}],
    });
    let inner: ?Crawler = null;
    let seenOptions: ?CrawlerOptions = null;
    const {fileMap} = createFileMap([], {
      crawlerFactory: factoryOptions => {
        const crawl = staticFactory(factoryOptions);
        inner = crawl;
        return options => {
          seenOptions = options;
          return crawl(options);
        };
      },
    });

    const {fileSystem} = await fileMap.build();
    expect(fileSystem.exists(p('src', 'Thing.js'))).toBe(true);

    // Re-invoke exactly as a recrawl would.
    if (inner == null || seenOptions == null) {
      throw new Error('crawler was not invoked');
    }
    const second = await inner(seenOptions);
    expect([...second.changedFiles.keys()]).toEqual([
      path.join('src', 'Thing.js'),
    ]);
  });

  test('end() is safe when not watching', async () => {
    const {fileMap} = createFileMap([{path: 'src/index.js'}]);
    await fileMap.build();
    await expect(fileMap.end()).resolves.toBeUndefined();
  });
});
