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

import {sep} from 'node:path';

const {PackageCache} = require('../PackageCache');

const mockReadFileSync = jest.fn();
jest.mock('node:fs', () => ({
  readFileSync: (...args) => mockReadFileSync(...args),
}));

function mockPackageJsons(packages: Array<[string, {name: string, ...}]>) {
  mockReadFileSync.mockImplementation((path, encoding) => {
    if (encoding === 'utf8') {
      for (const [filePath, json] of packages) {
        if (path === filePath) {
          return JSON.stringify(json);
        }
      }
    }
    throw new Error(`ENOENT: no such file: ${String(path)}`);
  });
}

beforeEach(() => {
  mockReadFileSync.mockReset();
});

const PKG_ROOT = sep + ['project', 'src'].join(sep);
const PKG_PATH = PKG_ROOT + sep + 'package.json';

const PKG2_ROOT = sep + ['project', 'lib'].join(sep);
const PKG2_PATH = PKG2_ROOT + sep + 'package.json';

describe('PackageCache', () => {
  test('reads and parses a package.json once', () => {
    mockPackageJsons([[PKG_PATH, {name: 'pkg'}]]);
    const cache = new PackageCache();

    const first = cache.getPackage(PKG_PATH);
    expect(first).toEqual({
      rootPath: PKG_ROOT,
      packageJson: {name: 'pkg'},
    });
    expect(cache.getPackage(PKG_PATH)).toBe(first);
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);
  });

  test('throws for a package.json that cannot be read', () => {
    mockPackageJsons([]);
    const cache = new PackageCache();

    expect(() => cache.getPackage(PKG_PATH)).toThrow('ENOENT');
  });

  test('invalidate re-reads the package.json on next access', () => {
    mockPackageJsons([[PKG_PATH, {name: 'pkg'}]]);
    const cache = new PackageCache();
    expect(cache.getPackage(PKG_PATH).packageJson.name).toBe('pkg');

    mockPackageJsons([[PKG_PATH, {name: 'pkg-renamed'}]]);
    expect(cache.getPackage(PKG_PATH).packageJson.name).toBe('pkg');

    cache.invalidate(PKG_PATH);
    expect(cache.getPackage(PKG_PATH).packageJson.name).toBe('pkg-renamed');
    expect(mockReadFileSync).toHaveBeenCalledTimes(2);
  });

  test('invalidate is scoped to the given package.json', () => {
    mockPackageJsons([
      [PKG_PATH, {name: 'pkg'}],
      [PKG2_PATH, {name: 'pkg2'}],
    ]);
    const cache = new PackageCache();
    const pkg2 = cache.getPackage(PKG2_PATH);
    cache.getPackage(PKG_PATH);

    cache.invalidate(PKG_PATH);
    expect(cache.getPackage(PKG2_PATH)).toBe(pkg2);
    expect(mockReadFileSync).toHaveBeenCalledTimes(2);
  });

  test('invalidating an unknown path is a no-op', () => {
    const cache = new PackageCache();
    expect(() => cache.invalidate(PKG_PATH)).not.toThrow();
  });

  test('readPackageJson option is used in place of reading the filesystem', () => {
    const readPackageJson = jest.fn((_path: string) => ({name: 'injected'}));
    const cache = new PackageCache({readPackageJson});

    expect(cache.getPackage(PKG_PATH).packageJson.name).toBe('injected');
    expect(readPackageJson).toHaveBeenCalledWith(PKG_PATH);
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });
});
