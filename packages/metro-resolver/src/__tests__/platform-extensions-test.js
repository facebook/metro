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

import createDefaultContext from '../createDefaultContext';
import FailedToResolvePathError from '../errors/FailedToResolvePathError';
import * as Resolver from '../index';
import {createResolutionContext, posixToSystemPath as p} from './utils';

const fileMap = {
  [p('/root/project/foo.js')]: '',
  [p('/root/project/bar.js')]: '',
  [p('/root/project/bar.ios.js')]: '',
  [p('/root/project/bar.native.js')]: '',
  [p('/root/project/baz.ios.js')]: '',
  [p('/root/project/baz.native.js')]: '',
};

const dependency = {
  name: './bar',
  data: {key: 'bar', asyncType: null, isESMImport: false, locs: []},
};

describe('preferNativePlatform: true', () => {
  const context: ResolutionContext = {
    ...createResolutionContext(fileMap),
    originModulePath: p('/root/project/foo.js'),
    preferNativePlatform: true,
  };

  test('platform: null resolves to .native.js', () => {
    expect(Resolver.resolve(context, './bar', null)).toEqual({
      type: 'sourceFile',
      filePath: p('/root/project/bar.native.js'),
    });
  });

  test('platform: ios resolves to .ios.js', () => {
    expect(Resolver.resolve(context, './bar', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: p('/root/project/bar.ios.js'),
    });
  });

  test('platform: android resolves to .js', () => {
    expect(Resolver.resolve(context, './bar', 'android')).toEqual({
      type: 'sourceFile',
      filePath: p('/root/project/bar.native.js'),
    });
  });

  test('platform: android, only ios+native available resolves to native', () => {
    expect(Resolver.resolve(context, './baz', 'android')).toEqual({
      type: 'sourceFile',
      filePath: p('/root/project/baz.native.js'),
    });
  });

  test('extension candidates in one directory do not repeat fileSystemLookup', () => {
    const base = createResolutionContext(fileMap);
    const fileSystemLookup = jest.fn(base.fileSystemLookup);
    const fileSystemOpenDir = jest.fn(base.fileSystemOpenDir);
    const contextWithCounts: ResolutionContext = {
      ...base,
      originModulePath: p('/root/project/foo.js'),
      preferNativePlatform: true,
      fileSystemLookup,
      fileSystemOpenDir,
    };

    expect(Resolver.resolve(contextWithCounts, './bar', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: p('/root/project/bar.ios.js'),
    });
    expect(fileSystemOpenDir).toHaveBeenCalledTimes(1);
    expect(fileSystemOpenDir).toHaveBeenCalledWith(p('/root/project'));
    expect(fileSystemLookup).not.toHaveBeenCalled();
  });

  test('falls back to fileSystemLookup when fileSystemOpenDir is omitted', () => {
    expect(
      Resolver.resolve(
        createDefaultContext(
          {...context, fileSystemOpenDir: undefined},
          dependency,
        ),
        './bar',
        'ios',
      ),
    ).toEqual({
      type: 'sourceFile',
      filePath: p('/root/project/bar.ios.js'),
    });
  });

  test.each([
    ['./baz.ios.js', '/root/project/baz.ios.js', []],
    ['../smth/beep.js', '/root/smth/beep.js', [[p('/root/smth/beep.js')]]],
  ])(
    'looks up redirect %s in the appropriate directory',
    (replacement, expectedPath, expectedLookups) => {
      const testFileMap = {
        ...fileMap,
        [p('/root/project/package.json')]: JSON.stringify({
          name: 'project',
          browser: {
            './bar.ios.js': replacement,
          },
        }),
        [p('/root/smth/beep.js')]: '',
      };
      const base = createResolutionContext(testFileMap);
      const fileSystemLookup = jest.fn(base.fileSystemLookup);
      const contextWithRedirect: ResolutionContext = {
        ...base,
        originModulePath: p('/root/project/foo.js'),
        preferNativePlatform: true,
        fileSystemLookup,
      };

      expect(Resolver.resolve(contextWithRedirect, './bar', 'ios')).toEqual({
        type: 'sourceFile',
        filePath: p(expectedPath),
      });
      expect(fileSystemLookup.mock.calls).toEqual(expectedLookups);
    },
  );

  test.each([
    [null, '/root/project/only.tsx'],
    [{main: 'index.js', browser: 'browser.js'}, '/root/project/only.tsx'],
    [
      {browser: {'./only.tsx': './replacement.tsx'}},
      '/root/project/replacement.tsx',
    ],
  ])(
    'reuses the containing package across extensions (%j)',
    (packageJson, expectedPath) => {
      const testFileMap = {
        ...fileMap,
        ...(packageJson == null
          ? {}
          : {
              [p('/root/project/package.json')]: JSON.stringify(packageJson),
            }),
        [p('/root/project/only.tsx')]: '',
        [p('/root/project/replacement.tsx')]: '',
      };
      const base = createResolutionContext(testFileMap);
      const getPackageForModule = jest.fn(base.getPackageForModule);
      const contextWithCount: ResolutionContext = {
        ...base,
        originModulePath: p('/root/project/foo.js'),
        preferNativePlatform: true,
        getPackageForModule,
      };

      expect(Resolver.resolve(contextWithCount, './only', 'ios')).toEqual({
        type: 'sourceFile',
        filePath: p(expectedPath),
      });
      // Once for the bare specifier, once for all extension candidates.
      expect(getPackageForModule).toHaveBeenCalledTimes(2);
    },
  );

  test('an exact filename does not initialize the extension redirector', () => {
    const base = createResolutionContext({
      ...fileMap,
      [p('/root/project/package.json')]: JSON.stringify({
        browser: {'./other.js': false},
      }),
    });
    const getPackageForModule = jest.fn(base.getPackageForModule);
    expect(
      Resolver.resolve(
        {
          ...base,
          originModulePath: context.originModulePath,
          getPackageForModule,
        },
        './bar.js',
        'ios',
      ),
    ).toEqual({type: 'sourceFile', filePath: p('/root/project/bar.js')});
    expect(getPackageForModule).toHaveBeenCalledTimes(1);
    expect(getPackageForModule).toHaveBeenCalledWith(p('/root/project/bar.js'));
  });

  test('an extension mapped to false resolves to an empty module', () => {
    const testFileMap = {
      ...fileMap,
      [p('/root/project/package.json')]: JSON.stringify({
        name: 'project',
        browser: {
          './bar.ios.js': false,
        },
      }),
    };
    const contextWithIgnore: ResolutionContext = {
      ...createResolutionContext(testFileMap),
      originModulePath: p('/root/project/foo.js'),
      preferNativePlatform: false,
    };

    expect(Resolver.resolve(contextWithIgnore, './bar', 'ios')).toEqual({
      type: 'empty',
    });
  });

  describe.each([true, false])(
    'directory candidates (openDir: %s)',
    useOpenDir => {
      test.each([null, {browser: {'./other.js': false}}])(
        'uses the candidate package instead of the containing package %j',
        parentPackage => {
          const base = createResolutionContext({
            [p('/root/project/foo.js')]: '',
            ...(parentPackage == null
              ? {}
              : {
                  [p('/root/project/package.json')]:
                    JSON.stringify(parentPackage),
                }),
            [p('/root/project/bar.js/package.json')]: JSON.stringify({
              browser: {'./': './replacement.js'},
            }),
            [p('/root/project/bar.js/replacement.js')]: '',
          });
          expect(
            Resolver.resolve(
              createDefaultContext(
                {
                  ...base,
                  originModulePath: p('/root/project/foo.js'),
                  fileSystemOpenDir: useOpenDir
                    ? base.fileSystemOpenDir
                    : undefined,
                },
                dependency,
              ),
              './bar',
              null,
            ),
          ).toEqual({
            type: 'sourceFile',
            filePath: p('/root/project/bar.js/replacement.js'),
          });
        },
      );
    },
  );
});

describe('preferNativePlatform: false', () => {
  const context: ResolutionContext = {
    ...createResolutionContext(fileMap),
    originModulePath: p('/root/project/foo.js'),
    preferNativePlatform: false,
  };

  test('platform: null resolves to .js', () => {
    expect(Resolver.resolve(context, './bar', null)).toEqual({
      type: 'sourceFile',
      filePath: p('/root/project/bar.js'),
    });
  });

  test('platform: ios resolves to .ios.js', () => {
    expect(Resolver.resolve(context, './bar', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: p('/root/project/bar.ios.js'),
    });
  });

  test('platform: android resolves to .js', () => {
    expect(Resolver.resolve(context, './bar', 'android')).toEqual({
      type: 'sourceFile',
      filePath: p('/root/project/bar.js'),
    });
  });

  test('platform: android, only ios+native available does not resolve', () => {
    expect(() => Resolver.resolve(context, './baz', 'android')).toThrow(
      FailedToResolvePathError,
    );
  });
});
