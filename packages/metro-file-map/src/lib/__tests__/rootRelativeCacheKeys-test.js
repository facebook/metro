/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {BuildParameters} from '../../flow-types';
import typeof PathModule from 'path';

import rootRelativeCacheKeys from '../rootRelativeCacheKeys';

const buildParameters: BuildParameters = {
  computeDependencies: false,
  computeSha1: false,
  dependencyExtractor: null,
  enableHastePackages: true,
  enableSymlinks: false,
  extensions: ['a'],
  forceNodeFilesystemAPI: false,
  hasteImplModulePath: null,
  ignorePattern: /a/,
  mocksPattern: /a/,
  platforms: ['a'],
  retainAllFiles: false,
  rootDir: '/root',
  roots: ['a', 'b'],
  skipPackageJson: false,
  cacheBreaker: 'a',
};

jest.mock(
  '/haste/1',
  () => ({
    getCacheKey: () => 'haste/1',
  }),
  {virtual: true},
);
jest.mock(
  '/haste/2',
  () => ({
    getCacheKey: () => 'haste/2',
  }),
  {virtual: true},
);
jest.mock(
  '/extractor/1',
  () => ({
    getCacheKey: () => 'extractor/1',
  }),
  {virtual: true},
);
jest.mock(
  '/extractor/2',
  () => ({
    getCacheKey: () => 'extractor/2',
  }),
  {virtual: true},
);

it('returns a distinct cache key for any change', () => {
  const {
    hasteImplModulePath: _,
    dependencyExtractor: __,
    rootDir: ___,
    ...simpleParameters
  } = buildParameters;

  const varyDefault = <T: $Keys<typeof simpleParameters>>(
    key: T,
    newVal: BuildParameters[T],
  ): BuildParameters => {
    // $FlowFixMe[invalid-computed-prop] Can't use a union for a computed prop
    return {...buildParameters, [key]: newVal};
  };

  const configs = Object.keys(simpleParameters).map(key => {
    switch (key) {
      // Boolean
      case 'computeDependencies':
      case 'computeSha1':
      case 'enableHastePackages':
      case 'enableSymlinks':
      case 'forceNodeFilesystemAPI':
      case 'retainAllFiles':
      case 'skipPackageJson':
        return varyDefault(key, !buildParameters[key]);
      // Strings
      case 'cacheBreaker':
        return varyDefault(key, 'foo');
      // String arrays
      case 'extensions':
      case 'platforms':
      case 'roots':
        return varyDefault(key, ['foo']);
      // Regexp
      case 'mocksPattern':
      case 'ignorePattern':
        return varyDefault(key, /foo/);
      default:
        (key: empty);
        throw new Error('Unrecognised key in build parameters: ' + key);
    }
  });
  configs.push(buildParameters);
  configs.push({...buildParameters, dependencyExtractor: '/extractor/1'});
  configs.push({...buildParameters, dependencyExtractor: '/extractor/2'});
  configs.push({...buildParameters, hasteImplModulePath: '/haste/1'});
  configs.push({...buildParameters, hasteImplModulePath: '/haste/2'});

  // Generate hashes for each config
  const configHashes = configs.map(
    config => rootRelativeCacheKeys(config).relativeConfigHash,
  );

  // We expect them all to have distinct hashes
  const seen = new Map<string, number>();
  for (const [i, configHash] of configHashes.entries()) {
    const seenIndex = seen.get(configHash);
    if (seenIndex != null) {
      // Two configs have the same hash - let Jest print the differences
      expect(configs[seenIndex]).toEqual(configs[i]);
    }
    seen.set(configHash, i);
  }
});

describe('cross-platform cache keys', () => {
  afterEach(() => {
    jest.unmock('path');
  });

  it('returns the same cache key for Windows and POSIX path parameters', () => {
    let mockPathModule;
    jest.mock('path', () => mockPathModule);

    jest.resetModules();
    mockPathModule = jest.requireActual<PathModule>('path').posix;
    const configHashPosix = require('../rootRelativeCacheKeys').default({
      ...buildParameters,
      rootDir: '/root',
      roots: ['/root/a', '/b/c'],
    }).relativeConfigHash;

    jest.resetModules();
    mockPathModule = jest.requireActual<PathModule>('path').win32;
    const configHashWin32 = require('../rootRelativeCacheKeys').default({
      ...buildParameters,
      rootDir: 'c:\\root',
      roots: ['c:\\root\\a', 'c:\\b\\c'],
    }).relativeConfigHash;
    expect(configHashWin32).toEqual(configHashPosix);
  });
});
