/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

import type {
  BuildParameters,
  CacheData,
  CacheManagerEventSource,
} from '../../flow-types';

import {DiskCacheManager} from '../DiskCacheManager';
import EventEmitter from 'events';
import * as path from 'path';
import {serialize} from 'v8';

const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();

jest.mock('fs', () => ({
  promises: {
    readFile: (...args) => mockReadFile(...args),
    writeFile: (...args) => mockWriteFile(...args),
  },
}));

// We're explicitly using node:timers, which Jest doesn't automatically mock
// with useFakeTimers. Global timers are mocked.
jest.mock('timers', () => ({
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
}));

const buildParameters: BuildParameters = {
  cacheBreaker: '',
  computeDependencies: true,
  computeSha1: true,
  dependencyExtractor: null,
  enableHastePackages: true,
  enableSymlinks: false,
  forceNodeFilesystemAPI: true,
  ignorePattern: /ignored/,
  mocksPattern: null,
  retainAllFiles: false,
  skipPackageJson: false,
  extensions: ['js', 'json'],
  hasteImplModulePath: require.resolve('../../__tests__/haste_impl'),
  platforms: ['ios', 'android'],
  rootDir: path.join('/', 'project'),
  roots: [
    path.join('/', 'project', 'fruits'),
    path.join('/', 'project', 'vegetables'),
  ],
};

const defaultConfig = {
  cacheFilePrefix: 'default-label',
  cacheDirectory: '/tmp/cache',
};

describe('cacheManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates valid cache file paths', () => {
    expect(
      DiskCacheManager.getCacheFilePath(buildParameters, 'file-prefix', '/'),
    ).toMatch(
      process.platform === 'win32'
        ? /^\\file-prefix-.*$/
        : /^\/file-prefix-.*$/,
    );
  });

  test('creates different cache file paths for different roots', () => {
    const cacheManager1 = new DiskCacheManager(
      {
        buildParameters: {
          ...buildParameters,
          rootDir: '/root1',
        },
      },
      defaultConfig,
    );
    const cacheManager2 = new DiskCacheManager(
      {
        buildParameters: {
          ...buildParameters,
          rootDir: '/root2',
        },
      },
      defaultConfig,
    );
    expect(cacheManager1.getCacheFilePath()).not.toBe(
      cacheManager2.getCacheFilePath(),
    );
  });

  test('creates different cache file paths for different dependency extractor cache keys', () => {
    const dependencyExtractor = require('../../__tests__/dependencyExtractor');
    const options = {
      buildParameters: {
        ...buildParameters,
        dependencyExtractor: require.resolve(
          '../../__tests__/dependencyExtractor',
        ),
      },
    };
    const config = {
      ...defaultConfig,
    };
    dependencyExtractor.setCacheKey('foo');
    const cacheManager1 = new DiskCacheManager(options, config);
    dependencyExtractor.setCacheKey('bar');
    const cacheManager2 = new DiskCacheManager(options, config);
    expect(cacheManager1.getCacheFilePath()).not.toBe(
      cacheManager2.getCacheFilePath(),
    );
  });

  test('creates different cache file paths for different values of computeDependencies', () => {
    const cacheManager1 = new DiskCacheManager(
      {
        buildParameters: {
          ...buildParameters,
          computeDependencies: true,
        },
      },
      defaultConfig,
    );
    const cacheManager2 = new DiskCacheManager(
      {
        buildParameters: {
          ...buildParameters,
          computeDependencies: false,
        },
      },
      defaultConfig,
    );
    expect(cacheManager1.getCacheFilePath()).not.toBe(
      cacheManager2.getCacheFilePath(),
    );
  });

  test('creates different cache file paths for different hasteImplModulePath cache keys', () => {
    const hasteImpl = require('../../__tests__/haste_impl');
    hasteImpl.setCacheKey('foo');
    const cacheManager1 = new DiskCacheManager(
      {buildParameters},
      defaultConfig,
    );
    hasteImpl.setCacheKey('bar');
    const cacheManager2 = new DiskCacheManager(
      {buildParameters},
      defaultConfig,
    );
    expect(cacheManager1.getCacheFilePath()).not.toBe(
      cacheManager2.getCacheFilePath(),
    );
  });

  test('creates different cache file paths for different projects', () => {
    const cacheManager1 = new DiskCacheManager(
      {buildParameters},
      {
        ...defaultConfig,
        cacheFilePrefix: 'package-a',
      },
    );
    const cacheManager2 = new DiskCacheManager(
      {buildParameters},
      {
        ...defaultConfig,
        cacheFilePrefix: 'package-b',
      },
    );
    expect(cacheManager1.getCacheFilePath()).not.toBe(
      cacheManager2.getCacheFilePath(),
    );
  });

  test('reads a cache file and deserialises its contents', async () => {
    const cacheManager = new DiskCacheManager({buildParameters}, defaultConfig);
    mockReadFile.mockResolvedValueOnce(serialize({foo: 'bar'}));
    const cache = await cacheManager.read();
    expect(mockReadFile).toHaveBeenCalledWith(cacheManager.getCacheFilePath());
    expect(cache).toEqual({foo: 'bar'});
  });

  test('serialises and writes a cache file', async () => {
    const cacheManager = new DiskCacheManager({buildParameters}, defaultConfig);
    const getSnapshot = jest.fn(
      () =>
        ({
          clocks: new Map([['foo', 'bar']]),
          fileSystemData: new Map(),
          plugins: new Map(),
        }) as CacheData,
    );
    await cacheManager.write(getSnapshot, {
      changedSinceCacheRead: true,
      eventSource: {onChange: () => () => {}},
      onWriteError: () => {},
    });
    expect(getSnapshot).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalledWith(
      cacheManager.getCacheFilePath(),
      serialize(getSnapshot()),
    );
  });

  test('does not write when there have been no changes', async () => {
    const cacheManager = new DiskCacheManager({buildParameters}, defaultConfig);
    const getSnapshot = jest.fn(
      () =>
        ({
          clocks: new Map([['foo', 'bar']]),
          fileSystemData: new Map(),
          plugins: new Map(),
        }) as CacheData,
    );
    await cacheManager.write(
      getSnapshot,
      // No changes
      {
        changedSinceCacheRead: false,
        eventSource: {onChange: () => () => {}},
        onWriteError: () => {},
      },
    );
    expect(getSnapshot).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  describe('autoSave', () => {
    let getSnapshot;
    let cacheManager: DiskCacheManager;
    let emitter: EventEmitter;
    let eventSource: CacheManagerEventSource;

    beforeEach(async () => {
      jest.clearAllMocks();
      getSnapshot = jest.fn();
      emitter = new EventEmitter();
      eventSource = {
        onChange: jest.fn().mockImplementation(cb => {
          emitter.on('change', cb);
          return () => emitter.removeListener('change', cb);
        }),
      };
      cacheManager = new DiskCacheManager(
        {buildParameters},
        {
          ...defaultConfig,
          autoSave: {
            debounceMs: 1000,
          },
        },
      );
      await cacheManager.write(getSnapshot, {
        changedSinceCacheRead: false,
        eventSource,
        onWriteError: () => {},
      });
    });

    test('subscribes to change events during write(), even on empty delta', async () => {
      expect(eventSource.onChange).toHaveBeenCalledWith(expect.any(Function));
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    test('gets a snapshot and saves the cache after debounceMs', async () => {
      emitter.emit('change');
      await jest.advanceTimersByTime(999);
      expect(getSnapshot).not.toHaveBeenCalled();
      await jest.advanceTimersByTime(1);
      expect(getSnapshot).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalledWith(
        cacheManager.getCacheFilePath(),
        expect.any(Buffer),
      );
    });

    test('successive changes within debounceMs are debounced', async () => {
      emitter.emit('change');
      await jest.advanceTimersByTime(500);
      emitter.emit('change');
      await jest.advanceTimersByTime(999);
      expect(getSnapshot).not.toHaveBeenCalled();
      await jest.advanceTimersByTime(1);
      expect(getSnapshot).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalledWith(
        cacheManager.getCacheFilePath(),
        expect.any(Buffer),
      );
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
    });
  });
});
