/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @emails oncall+metro_bundler
 */

'use strict';

import type {ResolutionContext} from '../index';

const FailedToResolvePathError = require('../FailedToResolvePathError');
const Resolver = require('../index');
const path = require('path');

const CONTEXT: ResolutionContext = (() => {
  const fileSet = new Set();
  (function fillFileSet(fileTree, prefix: string) {
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
          'banana-module': {
            'package.json': true,
            'main.js': true,
          },
          banana: {
            'package.json': true,
            'main.js': true,
            node_modules: {
              'banana-module': {
                'package.json': true,
                'main.js': true,
              },
            },
          },
        },
      },
      haste: {
        'Foo.js': true,
        'Bar.js': true,
        'Override.js': true,
        'some-package': {
          'package.json': true,
          subdir: {
            'other-file.js': true,
          },
          'main.js': true,
        },
      },
    },
    '/',
  );
  return {
    allowHaste: true,
    disableHierarchicalLookup: false,
    doesFileExist: (filePath: string) => fileSet.has(filePath),
    extraNodeModules: null,
    getPackageMainPath: (dirPath: string) =>
      path.join(path.dirname(dirPath), 'main'),
    isAssetFile: () => false,
    nodeModulesPaths: [],
    originModulePath: '/root/project/foo.js',
    preferNativePlatform: false,
    redirectModulePath: (filePath: string) => filePath,
    resolveAsset: (filePath: string) => null,
    resolveHasteModule: (name: string) => {
      const candidate = '/haste/' + name + '.js';
      if (fileSet.has(candidate)) {
        return candidate;
      }
      return null;
    },
    resolveHastePackage: (name: string) => {
      const candidate = '/haste/' + name + '/package.json';
      if (fileSet.has(candidate)) {
        return candidate;
      }
      return null;
    },
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
  const context = {...CONTEXT, nodeModulesPaths: ['/other-root/node_modules']};
  expect(Resolver.resolve(context, 'banana', null)).toEqual({
    type: 'sourceFile',
    filePath: '/other-root/node_modules/banana/main.js',
  });

  expect(() => Resolver.resolve(context, 'kiwi', null))
    .toThrowErrorMatchingInlineSnapshot(`
    "Module does not exist in the Haste module map or in these directories:
      /root/project/node_modules
      /root/node_modules
      /node_modules
      /other-root/node_modules
    "
  `);
});

it('resolves transitive dependencies when using `nodeModulesPaths`', () => {
  const context = {
    ...CONTEXT,
    originModulePath: '/other-root/node_modules/banana/main.js',
    nodeModulesPaths: ['/other-root/node_modules'],
  };

  expect(Resolver.resolve(context, 'banana-module', null)).toEqual({
    type: 'sourceFile',
    filePath:
      '/other-root/node_modules/banana/node_modules/banana-module/main.js',
  });

  expect(Resolver.resolve(context, 'banana-module', null)).not.toEqual({
    type: 'sourceFile',
    filePath: '/other-root/node_modules/banana-module/main.js',
  });
});

describe('disableHierarchicalLookup', () => {
  const context = {...CONTEXT, disableHierarchicalLookup: true};

  it('disables node_modules lookup', () => {
    expect(() => Resolver.resolve(context, 'apple', null))
      .toThrowErrorMatchingInlineSnapshot(`
      "Module does not exist in the Haste module map

      "
    `);
  });

  it('respects nodeModulesPaths', () => {
    const contextWithOtherRoot = {
      ...context,
      nodeModulesPaths: ['/other-root/node_modules'],
    };

    // apple exists in /root/node_modules
    expect(() => Resolver.resolve(contextWithOtherRoot, 'apple', null))
      .toThrowErrorMatchingInlineSnapshot(`
      "Module does not exist in the Haste module map or in these directories:
        /other-root/node_modules
      "
    `);

    expect(Resolver.resolve(contextWithOtherRoot, 'banana', null)).toEqual({
      type: 'sourceFile',
      filePath: '/other-root/node_modules/banana/main.js',
    });

    // kiwi doesn't exist anywhere
    expect(() => Resolver.resolve(contextWithOtherRoot, 'kiwi', null))
      .toThrowErrorMatchingInlineSnapshot(`
      "Module does not exist in the Haste module map or in these directories:
        /other-root/node_modules
      "
    `);
  });

  it('respects extraNodeModules', () => {
    const contextWithExtra = {
      ...context,
      extraNodeModules: {
        'renamed-apple': '/root/node_modules/apple',
      },
    };

    expect(Resolver.resolve(contextWithExtra, 'renamed-apple', null)).toEqual({
      type: 'sourceFile',
      filePath: '/root/node_modules/apple/main.js',
    });
  });
});

it('resolves Haste modules', () => {
  expect(Resolver.resolve(CONTEXT, 'Foo', null)).toEqual({
    type: 'sourceFile',
    filePath: '/haste/Foo.js',
  });
  expect(Resolver.resolve(CONTEXT, 'Bar', null)).toEqual({
    type: 'sourceFile',
    filePath: '/haste/Bar.js',
  });
});

it('resolves a Haste package', () => {
  expect(Resolver.resolve(CONTEXT, 'some-package', null)).toEqual({
    type: 'sourceFile',
    filePath: '/haste/some-package/main.js',
  });
});

it('resolves a file inside a Haste package', () => {
  expect(
    Resolver.resolve(CONTEXT, 'some-package/subdir/other-file', null),
  ).toEqual({
    type: 'sourceFile',
    filePath: '/haste/some-package/subdir/other-file.js',
  });
});

it('throws a descriptive error when a file inside a Haste package cannot be resolved', () => {
  expect(() => {
    Resolver.resolve(CONTEXT, 'some-package/subdir/does-not-exist', null);
  }).toThrowErrorMatchingInlineSnapshot(`
    "While resolving module \`some-package/subdir/does-not-exist\`, the Haste package \`some-package\` was found. However the module \`subdir/does-not-exist\` could not be found within the package. Indeed, none of these files exist:

      * \`/haste/some-package/subdir/does-not-exist(.js)\`
      * \`/haste/some-package/subdir/does-not-exist/index(.js)\`"
  `);
});

describe('redirectModulePath', () => {
  const redirectModulePath = jest.fn();
  const context = {...CONTEXT, redirectModulePath};

  beforeEach(() => {
    redirectModulePath.mockReset();
    redirectModulePath.mockImplementation(filePath => false);
  });

  it('is used for relative path requests', () => {
    expect(Resolver.resolve(context, './bar', null)).toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(redirectModulePath).toBeCalledTimes(1);
    expect(redirectModulePath).toBeCalledWith('/root/project/bar');
  });

  it('is used for absolute path requests', () => {
    expect(Resolver.resolve(context, '/bar', null)).toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(redirectModulePath).toBeCalledTimes(1);
    expect(redirectModulePath).toBeCalledWith('/bar');
  });

  it('is used for non-Haste package requests', () => {
    expect(Resolver.resolve(context, 'does-not-exist', null))
      .toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(redirectModulePath).toBeCalledTimes(1);
    expect(redirectModulePath).toBeCalledWith('does-not-exist');
  });

  it('can be used to redirect to an arbitrary relative module', () => {
    redirectModulePath
      .mockImplementationOnce(filePath => '../smth/beep')
      .mockImplementation(filePath => filePath);
    expect(Resolver.resolve(context, 'does-not-exist', null))
      .toMatchInlineSnapshot(`
      Object {
        "filePath": "/root/smth/beep.js",
        "type": "sourceFile",
      }
    `);
    expect(redirectModulePath.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "does-not-exist",
        ],
        Array [
          "/root/smth/beep",
        ],
        Array [
          "/root/smth/beep.js",
        ],
      ]
    `);
  });

  it("is called for source extension candidates that don't exist on disk", () => {
    redirectModulePath.mockImplementation(filePath =>
      filePath.replace('.another-fake-ext', '.js'),
    );
    expect(
      Resolver.resolve(
        {...context, sourceExts: ['fake-ext', 'another-fake-ext']},
        '../smth/beep',
        null,
      ),
    ).toMatchInlineSnapshot(`
      Object {
        "filePath": "/root/smth/beep.js",
        "type": "sourceFile",
      }
    `);
    expect(redirectModulePath.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "/root/smth/beep",
        ],
        Array [
          "/root/smth/beep.fake-ext",
        ],
        Array [
          "/root/smth/beep.another-fake-ext",
        ],
      ]
    `);
  });

  it('can resolve to empty from a candidate with an added source extension', () => {
    redirectModulePath.mockImplementation(filePath =>
      filePath.endsWith('.fake-ext') ? false : filePath,
    );
    expect(
      Resolver.resolve(
        {...context, sourceExts: ['fake-ext', 'js']},
        '../smth/beep',
        null,
      ),
    ).toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(redirectModulePath.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "/root/smth/beep",
        ],
        Array [
          "/root/smth/beep.fake-ext",
        ],
      ]
    `);
  });

  it('is not called redundantly for a candidate that does exist on disk', () => {
    redirectModulePath.mockImplementation(filePath => filePath);
    expect(Resolver.resolve(context, './bar', null)).toMatchInlineSnapshot(`
      Object {
        "filePath": "/root/project/bar.js",
        "type": "sourceFile",
      }
    `);
    expect(redirectModulePath.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "/root/project/bar",
        ],
        Array [
          "/root/project/bar.js",
        ],
      ]
    `);
  });
});

describe('resolveRequest', () => {
  const resolveRequest = jest.fn();
  const context = {...CONTEXT, resolveRequest};

  beforeEach(() => {
    resolveRequest.mockReset();
    resolveRequest.mockImplementation(() => ({type: 'empty'}));
  });

  it('is called for non-Haste package requests', () => {
    expect(Resolver.resolve(context, 'does-not-exist', null))
      .toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...context, resolveRequest: Resolver.resolve},
      'does-not-exist',
      null,
    );
  });

  it('is called for relative path requests', () => {
    expect(Resolver.resolve(context, './does-not-exist', null))
      .toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...context, resolveRequest: Resolver.resolve},
      './does-not-exist',
      null,
    );
  });

  it('is called for absolute path requests', () => {
    expect(Resolver.resolve(context, '/does-not-exist', null))
      .toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...context, resolveRequest: Resolver.resolve},
      '/does-not-exist',
      null,
    );
  });

  it('is called for Haste packages', () => {
    expect(Resolver.resolve(context, 'some-package', null))
      .toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...context, resolveRequest: Resolver.resolve},
      'some-package',
      null,
    );
  });

  it('is called for Haste modules', () => {
    expect(Resolver.resolve(context, 'Foo', null)).toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...context, resolveRequest: Resolver.resolve},
      'Foo',
      null,
    );
  });

  it('is called with the platform and non-redirected module path', () => {
    const contextWithRedirect = {
      ...context,
      redirectModulePath: filePath => filePath + '.redirected',
    };
    expect(Resolver.resolve(contextWithRedirect, 'does-not-exist', 'android'))
      .toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...contextWithRedirect, resolveRequest: Resolver.resolve},
      'does-not-exist',
      'android',
    );
  });

  it('is called if redirectModulePath returns false', () => {
    resolveRequest.mockImplementation(() => ({
      type: 'sourceFile',
      filePath: '/some/fake/path',
    }));
    const contextWithRedirect = {
      ...context,
      redirectModulePath: filePath => false,
    };
    expect(Resolver.resolve(contextWithRedirect, 'does-not-exist', 'android'))
      .toMatchInlineSnapshot(`
      Object {
        "filePath": "/some/fake/path",
        "type": "sourceFile",
      }
    `);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...contextWithRedirect, resolveRequest: Resolver.resolve},
      'does-not-exist',
      'android',
    );
  });

  it('can forward requests to the standard resolver', () => {
    // This test shows a common pattern for wrapping the standard resolver.
    resolveRequest.mockImplementation((ctx, moduleName, platform) => {
      return Resolver.resolve(
        {...ctx, resolveRequest: null},
        moduleName,
        platform,
      );
    });
    expect(() => {
      Resolver.resolve(context, 'does-not-exist', 'android');
    }).toThrowErrorMatchingInlineSnapshot(`
      "Module does not exist in the Haste module map or in these directories:
        /root/project/node_modules
        /root/node_modules
        /node_modules
      "
    `);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...context, resolveRequest: Resolver.resolve},
      'does-not-exist',
      'android',
    );
  });

  it('can forward Haste requests to the standard resolver', () => {
    resolveRequest.mockImplementation((ctx, moduleName, platform) => {
      return Resolver.resolve(
        {...ctx, resolveRequest: null},
        moduleName,
        platform,
      );
    });
    expect(Resolver.resolve(context, 'Foo', null)).toMatchInlineSnapshot(`
      Object {
        "filePath": "/haste/Foo.js",
        "type": "sourceFile",
      }
    `);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...context, resolveRequest: Resolver.resolve},
      'Foo',
      null,
    );
  });

  it('can forward requests to the standard resolver via resolveRequest', () => {
    resolveRequest.mockImplementation((ctx, moduleName, platform) => {
      return ctx.resolveRequest(ctx, moduleName, platform);
    });
    expect(() => {
      Resolver.resolve(context, 'does-not-exist', 'android');
    }).toThrowErrorMatchingInlineSnapshot(`
      "Module does not exist in the Haste module map or in these directories:
        /root/project/node_modules
        /root/node_modules
        /node_modules
      "
    `);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...context, resolveRequest: Resolver.resolve},
      'does-not-exist',
      'android',
    );
  });

  it('throwing an error stops the standard resolution', () => {
    resolveRequest.mockImplementation((ctx, moduleName, platform) => {
      throw new Error('Custom resolver hit an error');
    });
    const {resolveRequest: _, ...contextWithoutCustomResolver} = context;
    // Ensure that the request has a standard resolution.
    expect(
      Resolver.resolve(
        contextWithoutCustomResolver,
        '/root/project/foo.js',
        'android',
      ),
    ).toMatchInlineSnapshot(`
      Object {
        "filePath": "/root/project/foo.js",
        "type": "sourceFile",
      }
    `);
    // Ensure that we don't get this standard resolution if we throw.
    expect(() => {
      Resolver.resolve(context, '/root/project/foo.js', 'android');
    }).toThrowErrorMatchingInlineSnapshot(`"Custom resolver hit an error"`);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...context, resolveRequest: Resolver.resolve},
      '/root/project/foo.js',
      'android',
    );
  });
});
