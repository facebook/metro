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

import type {ResolutionContext} from '../index';
import type {MockFileMap} from './utils';

import createDefaultContext from '../createDefaultContext';
import FailedToResolvePathError from '../errors/FailedToResolvePathError';
import * as Resolver from '../index';
import {createResolutionContext, posixToSystemPath as p} from './utils';
import TreeFS from 'metro-file-map/private/lib/TreeFS';
import {PackageCache} from 'metro/private/node-haste/PackageCache';

const fileMap: MockFileMap = {
  [p('/root/project/foo.js')]: '',
  [p('/root/project/baz/index.js')]: '',
  [p('/root/project/baz.js')]: {realPath: null},
  [p('/root/project/link-to-foo.js')]: {realPath: p('/root/project/foo.js')},
};

const CONTEXT: ResolutionContext = {
  ...createResolutionContext(fileMap),
  originModulePath: p('/root/project/foo.js'),
};

test('resolves to a real path when the chosen candidate is a symlink', () => {
  expect(Resolver.resolve(CONTEXT, './link-to-foo', null)).toEqual({
    type: 'sourceFile',
    filePath: p('/root/project/foo.js'),
  });
});

test('does not resolve to a broken symlink', () => {
  // ./baz.js is a broken link, baz/index.js is real
  expect(() => Resolver.resolve(CONTEXT, './baz.js', null)).toThrow(
    FailedToResolvePathError,
  );
  expect(Resolver.resolve(CONTEXT, './baz', null)).toEqual({
    type: 'sourceFile',
    filePath: p('/root/project/baz/index.js'),
  });
});

test.each([true, false])(
  'uses the target package through a directory symlink (native opener: %s)',
  useOpenDir => {
    const packageJson = {browser: {'./foo.ios.js': './replacement.js'}};
    const base = createResolutionContext({
      [p('/project/target/package.json')]: JSON.stringify(packageJson),
    });
    const tree = new TreeFS({
      rootDir: p('/project'),
      files: new Map([
        [p('linked'), [0, 0, 0, null, 'target', null]],
        [p('target/package.json'), [0, 0, 0, null, 0, null]],
        [p('target/foo.ios.js'), [0, 0, 0, null, 0, null]],
        [p('target/replacement.js'), [0, 0, 0, null, 0, null]],
      ]),
      processFile: () => {
        throw new Error('Unexpected file processing');
      },
    });
    const packageCache = new PackageCache({
      getClosestPackage: filePath => {
        const found = tree.hierarchicalLookup(filePath, 'package.json', {
          breakOnSegment: 'node_modules',
          subpathType: 'f',
        });
        return found == null
          ? null
          : {
              packageJsonPath: found.absolutePath,
              packageRelativePath: found.containerRelativePath,
            };
      },
      readPackageJson: () => packageJson,
    });
    const fileSystemLookup = filePath => {
      const result = tree.lookup(filePath);
      return result.exists
        ? {exists: true, type: result.type, realPath: result.realPath}
        : {exists: false};
    };
    const context = {
      ...base,
      originModulePath: p('/project/origin.js'),
      fileSystemLookup,
      fileSystemOpenDir: directory => tree.openDir(directory),
      getPackageForModule: filePath =>
        packageCache.getPackageForModule(filePath),
    };
    // Exercise both the TreeFS handle and the compatibility fallback.
    const normalized = createDefaultContext(
      {
        ...context,
        fileSystemOpenDir: useOpenDir ? context.fileSystemOpenDir : undefined,
      },
      {
        name: './linked/foo',
        data: {key: 'foo', asyncType: null, isESMImport: false, locs: []},
      },
    );
    expect(Resolver.resolve(normalized, './linked/foo', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: p('/project/target/replacement.js'),
    });
  },
);
