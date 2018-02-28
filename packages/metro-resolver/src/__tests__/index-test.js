/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @emails oncall+javascript_foundation
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
          tadam: {
            'package.json': true,
            'main.js': true,
          },
          invalid: {
            'package.json': true,
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
    originModulePath: '/root/project/foo.js',
    preferNativePlatform: false,
    redirectModulePath: filePath => filePath,
    resolveAsset: filePath => null,
    resolveHasteModule: name => null,
    resolveHastePackage: name => null,
    sourceExts: ['js'],
  };
})();

it('resolves relative path', () => {
  expect(Resolver.resolve(CONTEXT, './bar', null)).toEqual({
    type: 'sourceFile',
    filePath: '/root/project/bar.js',
  });
});

it('resolves relative path in another folder', () => {
  expect(Resolver.resolve(CONTEXT, '../smth/beep', null)).toEqual({
    type: 'sourceFile',
    filePath: '/root/smth/beep.js',
  });
});

it('resolves a simple node_modules', () => {
  expect(Resolver.resolve(CONTEXT, 'tadam', null)).toEqual({
    type: 'sourceFile',
    filePath: '/root/node_modules/tadam/main.js',
  });
});

it('fails to resolve relative path', () => {
  try {
    Resolver.resolve(CONTEXT, './tadam', null);
    throw new Error('should not reach');
  } catch (error) {
    if (!(error instanceof FailedToResolvePathError)) {
      throw error;
    }
    expect(error.candidates).toEqual({
      dir: {
        candidateExts: ['', '.js'],
        filePathPrefix: '/root/project/tadam/index',
        type: 'sourceFile',
      },
      file: {
        candidateExts: ['', '.js'],
        filePathPrefix: '/root/project/tadam',
        type: 'sourceFile',
      },
    });
  }
});

it('throws on invalid node package', () => {
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
