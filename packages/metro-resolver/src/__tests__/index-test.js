/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @emails oncall+metro_bundler
 */

'use strict';

const FailedToResolvePathError = require('../FailedToResolvePathError');
const Resolver = require('../index');

const path = require('path');

import type {ResolutionContext} from '../index';

const CONTEXT: ResolutionContext = (() => {
  const fileSet = new Set();
  (function fillFileSet(fileTree, prefix) {
    for (const entName in fileTree) {
      const entPath = path.join(prefix, entName);
      if (fileTree[entName] === true) {
        fileSet.add(entPath);
        continue;
      }
      fillFileSet(fileTree[entName], entPath);
    }
  })(
    {
      root: {
        project: {
          'foo.js': true,
          'bar.js': true,
        },
        smth: {
          'beep.js': true,
        },
        node_modules: {
          apple: {
            'package.json': true,
            'main.js': true,
          },
          invalid: {
            'package.json': true,
          },
        },
      },
      node_modules: {
        'root-module': {
          'package.json': true,
          'main.js': true,
        },
      },
      'other-root': {
        node_modules: {
          banana: {
            'package.json': true,
            'main.js': true,
          },
        },
      },
    },
    '/',
  );
  return {
    allowHaste: true,
    doesFileExist: filePath => fileSet.has(filePath),
    extraNodeModules: null,
    getPackageMainPath: dirPath => path.join(path.dirname(dirPath), 'main'),
    isAssetFile: () => false,
    nodeModulesPaths: [],
    originModulePath: '/root/project/foo.js',
    preferNativePlatform: false,
    redirectModulePath: filePath => filePath,
    resolveAsset: filePath => null,
    resolveHasteModule: name => null,
    resolveHastePackage: name => null,
    sourceExts: ['js'],
  };
})();

it('resolves a relative path', () => {
  expect(Resolver.resolve(CONTEXT, './bar', null)).toEqual({
    type: 'sourceFile',
    filePath: '/root/project/bar.js',
  });
});

it('resolves a relative path in another folder', () => {
  expect(Resolver.resolve(CONTEXT, '../smth/beep', null)).toEqual({
    type: 'sourceFile',
    filePath: '/root/smth/beep.js',
  });
});

it('resolves a package in `node_modules`', () => {
  expect(Resolver.resolve(CONTEXT, 'apple', null)).toEqual({
    type: 'sourceFile',
    filePath: '/root/node_modules/apple/main.js',
  });
});

it('fails to resolve a relative path', () => {
  try {
    Resolver.resolve(CONTEXT, './apple', null);
    throw new Error('should not reach');
  } catch (error) {
    if (!(error instanceof FailedToResolvePathError)) {
      throw error;
    }
    expect(error.candidates).toEqual({
      dir: {
        candidateExts: ['', '.js'],
        filePathPrefix: '/root/project/apple/index',
        type: 'sourceFile',
      },
      file: {
        candidateExts: ['', '.js'],
        filePathPrefix: '/root/project/apple',
        type: 'sourceFile',
      },
    });
  }
});

it('throws on invalid package name', () => {
  try {
    Resolver.resolve(CONTEXT, 'invalid', null);
    throw new Error('should have thrown');
  } catch (error) {
    if (!(error instanceof Resolver.InvalidPackageError)) {
      throw error;
    }
    expect(error.message).toMatchSnapshot();
    expect(error.fileCandidates).toEqual({
      candidateExts: ['', '.js'],
      filePathPrefix: '/root/node_modules/invalid/main',
      type: 'sourceFile',
    });
    expect(error.indexCandidates).toEqual({
      candidateExts: ['', '.js'],
      filePathPrefix: '/root/node_modules/invalid/main/index',
      type: 'sourceFile',
    });
    expect(error.mainPrefixPath).toBe('/root/node_modules/invalid/main');
    expect(error.packageJsonPath).toBe(
      '/root/node_modules/invalid/package.json',
    );
  }
});

it('resolves `node_modules` up to the root', () => {
  expect(Resolver.resolve(CONTEXT, 'root-module', null)).toEqual({
    type: 'sourceFile',
    filePath: '/node_modules/root-module/main.js',
  });

  expect(() => Resolver.resolve(CONTEXT, 'non-existent-module', null))
    .toThrowErrorMatchingInlineSnapshot(`
    "Module does not exist in the Haste module map or in these directories:
      /root/project/node_modules
      /root/node_modules
      /node_modules
    "
  `);
});

it('does not resolve to additional `node_modules` if `nodeModulesPaths` is not specified', () => {
  expect(() => Resolver.resolve(CONTEXT, 'banana', null))
    .toThrowErrorMatchingInlineSnapshot(`
    "Module does not exist in the Haste module map or in these directories:
      /root/project/node_modules
      /root/node_modules
      /node_modules
    "
  `);
});

it('uses `nodeModulesPaths` to find additional node_modules not in the direct path', () => {
  const context = Object.assign({}, CONTEXT, {
    nodeModulesPaths: ['/other-root/node_modules'],
  });
  expect(Resolver.resolve(context, 'banana', null)).toEqual({
    type: 'sourceFile',
    filePath: '/other-root/node_modules/banana/main.js',
  });

  expect(() => Resolver.resolve(context, 'kiwi', null))
    .toThrowErrorMatchingInlineSnapshot(`
    "Module does not exist in the Haste module map or in these directories:
      /other-root/node_modules
      /root/project/node_modules
      /root/node_modules
      /node_modules
    "
  `);
});
