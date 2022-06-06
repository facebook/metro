/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+react_native
 * @format
 * @flow
 */

import type {BuildParameters} from '../../flow-types';

import {DiskCacheManager} from '../DiskCacheManager';
import * as path from 'path';

const buildParameters: BuildParameters = {
  cacheBreaker: '',
  computeDependencies: true,
  computeSha1: true,
  dependencyExtractor: null,
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
  buildParameters,
  cacheFilePrefix: 'default-label',
  cacheDirectory: '/tmp/cache',
};

describe('cacheManager', () => {
  it('creates valid cache file paths', () => {
    expect(
      DiskCacheManager.getCacheFilePath(buildParameters, 'file-prefix', '/'),
    ).toMatch(
      process.platform === 'win32'
        ? /^\\file-prefix-.*$/
        : /^\/file-prefix-.*$/,
    );
  });

  it('creates different cache file paths for different roots', () => {
    const cacheManager1 = new DiskCacheManager({
      ...defaultConfig,
      buildParameters: {
        ...buildParameters,
        rootDir: '/root1',
      },
    });
    const cacheManager2 = new DiskCacheManager({
      ...defaultConfig,
      buildParameters: {
        ...buildParameters,
        rootDir: '/root2',
      },
    });
    expect(cacheManager1.getCacheFilePath()).not.toBe(
      cacheManager2.getCacheFilePath(),
    );
  });

  it('creates different cache file paths for different dependency extractor cache keys', () => {
    const dependencyExtractor = require('../../__tests__/dependencyExtractor');
    const config = {
      ...defaultConfig,
      buildParameters: {
        ...buildParameters,
        dependencyExtractor: require.resolve(
          '../../__tests__/dependencyExtractor',
        ),
      },
    };
    dependencyExtractor.setCacheKey('foo');
    const cacheManager1 = new DiskCacheManager(config);
    dependencyExtractor.setCacheKey('bar');
    const cacheManager2 = new DiskCacheManager(config);
    expect(cacheManager1.getCacheFilePath()).not.toBe(
      cacheManager2.getCacheFilePath(),
    );
  });

  it('creates different cache file paths for different values of computeDependencies', () => {
    const cacheManager1 = new DiskCacheManager({
      ...defaultConfig,
      buildParameters: {
        ...buildParameters,
        computeDependencies: true,
      },
    });
    const cacheManager2 = new DiskCacheManager({
      ...defaultConfig,
      buildParameters: {
        ...buildParameters,
        computeDependencies: false,
      },
    });
    expect(cacheManager1.getCacheFilePath()).not.toBe(
      cacheManager2.getCacheFilePath(),
    );
  });

  it('creates different cache file paths for different hasteImplModulePath cache keys', () => {
    const hasteImpl = require('../../__tests__/haste_impl');
    hasteImpl.setCacheKey('foo');
    const cacheManager1 = new DiskCacheManager(defaultConfig);
    hasteImpl.setCacheKey('bar');
    const cacheManager2 = new DiskCacheManager(defaultConfig);
    expect(cacheManager1.getCacheFilePath()).not.toBe(
      cacheManager2.getCacheFilePath(),
    );
  });

  it('creates different cache file paths for different projects', () => {
    const cacheManager1 = new DiskCacheManager({
      ...defaultConfig,
      cacheFilePrefix: 'package-a',
    });
    const cacheManager2 = new DiskCacheManager({
      ...defaultConfig,
      cacheFilePrefix: 'package-b',
    });
    expect(cacheManager1.getCacheFilePath()).not.toBe(
      cacheManager2.getCacheFilePath(),
    );
  });
});
