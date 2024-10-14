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

'use strict';

import type {ResolutionContext} from '../index';

import {createResolutionContext} from './utils';

let Resolver = require('../index');

const fileMap = {
  '/root/project/foo.js': '',
  '/root/project/foo/index.js': '',
  '/root/project/bar.js': '',
  '/root/smth/beep.js': '',
  '/root/node_modules/apple/package.json': JSON.stringify({
    name: 'apple',
    main: 'main',
  }),
  '/root/node_modules/apple/main.js': '',
  '/root/node_modules/invalid/package.json': JSON.stringify({
    name: 'invalid',
    main: 'main',
  }),
  '/root/node_modules/flat-file-in-node-modules.js': '',
  '/node_modules/root-module/main.js': '',
  '/node_modules/root-module/package.json': JSON.stringify({
    name: 'root-module',
    main: 'main',
  }),
  '/other-root/node_modules/banana-module/main.js': '',
  '/other-root/node_modules/banana-module/package.json': JSON.stringify({
    name: 'banana-module',
    main: 'main',
  }),
  '/other-root/node_modules/banana/main.js': '',
  '/other-root/node_modules/banana/package.json': JSON.stringify({
    name: 'banana',
    main: 'main',
  }),
  '/other-root/node_modules/banana/node_modules/banana-module/main.js': '',
  '/other-root/node_modules/banana/node_modules/banana-module/package.json':
    JSON.stringify({
      name: 'banana-module',
      main: 'main',
    }),
  '/haste/Foo.js': '',
  '/haste/Bar.js': '',
  '/haste/Override.js': '',
  '/haste/some-package/package.json': JSON.stringify({
    name: 'some-package',
    main: 'main',
  }),
  '/haste/some-package/subdir/other-file.js': '',
  '/haste/some-package/main.js': '',
};

const CONTEXT: ResolutionContext = {
  ...createResolutionContext(fileMap),
  originModulePath: '/root/project/foo.js',
  resolveHasteModule: (name: string) => {
    const candidate = '/haste/' + name + '.js';
    if (candidate in fileMap) {
      return candidate;
    }
    return null;
  },
  resolveHastePackage: (name: string) => {
    const candidate = '/haste/' + name + '/package.json';
    if (candidate in fileMap) {
      return candidate;
    }
    return null;
  },
};

test('resolves a relative path', () => {
  expect(Resolver.resolve(CONTEXT, './bar', null)).toEqual({
    type: 'sourceFile',
    filePath: '/root/project/bar.js',
  });
});

test('resolves a relative path ending in a slash as a directory', () => {
  expect(Resolver.resolve(CONTEXT, './foo/', null)).toEqual({
    type: 'sourceFile',
    filePath: '/root/project/foo/index.js',
  });
});

test('resolves a relative path in another folder', () => {
  expect(Resolver.resolve(CONTEXT, '../smth/beep', null)).toEqual({
    type: 'sourceFile',
    filePath: '/root/smth/beep.js',
  });
});

test('does not resolve a relative path ending in a slash as a file', () => {
  expect(() => Resolver.resolve(CONTEXT, './bar/', null)).toThrow(
    new Resolver.FailedToResolvePathError({
      file: null,
      dir: {
        type: 'sourceFile',
        filePathPrefix: '/root/project/bar/',
        candidateExts: [],
      },
    }),
  );
});

test('resolves a package in `node_modules`', () => {
  expect(Resolver.resolve(CONTEXT, 'apple', null)).toEqual({
    type: 'sourceFile',
    filePath: '/root/node_modules/apple/main.js',
  });
});

test('resolves a standalone file in `node_modules`', () => {
  expect(Resolver.resolve(CONTEXT, 'flat-file-in-node-modules', null)).toEqual({
    type: 'sourceFile',
    filePath: '/root/node_modules/flat-file-in-node-modules.js',
  });
});

test('fails to resolve a relative path', () => {
  try {
    Resolver.resolve(CONTEXT, './apple', null);
    throw new Error('should not reach');
  } catch (error) {
    if (!(error instanceof Resolver.FailedToResolvePathError)) {
      throw error;
    }
    expect(error.candidates).toEqual({
      dir: {
        candidateExts: [],
        filePathPrefix: '/root/project/apple',
        type: 'sourceFile',
      },
      file: {
        candidateExts: ['', '.js', '.jsx', '.json', '.ts', '.tsx'],
        filePathPrefix: '/root/project/apple',
        type: 'sourceFile',
      },
    });
  }
});

test('throws on invalid package name', () => {
  try {
    Resolver.resolve(CONTEXT, 'invalid', null);
    throw new Error('should have thrown');
  } catch (error) {
    if (!(error instanceof Resolver.InvalidPackageError)) {
      throw error;
    }
    expect(error.message).toMatchSnapshot();
    expect(error.fileCandidates).toEqual({
      candidateExts: ['', '.js', '.jsx', '.json', '.ts', '.tsx'],
      filePathPrefix: '/root/node_modules/invalid/main',
      type: 'sourceFile',
    });
    expect(error.indexCandidates).toEqual({
      candidateExts: ['', '.js', '.jsx', '.json', '.ts', '.tsx'],
      filePathPrefix: '/root/node_modules/invalid/main/index',
      type: 'sourceFile',
    });
    expect(error.mainModulePath).toBe('/root/node_modules/invalid/main');
    expect(error.packageJsonPath).toBe(
      '/root/node_modules/invalid/package.json',
    );
  }
});

test('resolves `node_modules` up to the root', () => {
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

test('does not resolve to additional `node_modules` if `nodeModulesPaths` is not specified', () => {
  expect(() => Resolver.resolve(CONTEXT, 'banana', null))
    .toThrowErrorMatchingInlineSnapshot(`
    "Module does not exist in the Haste module map or in these directories:
      /root/project/node_modules
      /root/node_modules
      /node_modules
    "
  `);
});

test('uses `nodeModulesPaths` to find additional node_modules not in the direct path', () => {
  const context = {
    ...CONTEXT,
    nodeModulesPaths: ['/other-root/node_modules'],
  };
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

test('resolves transitive dependencies when using `nodeModulesPaths`', () => {
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

  test('disables node_modules lookup', () => {
    expect(() => Resolver.resolve(context, 'apple', null))
      .toThrowErrorMatchingInlineSnapshot(`
      "Module does not exist in the Haste module map

      "
    `);
  });

  test('respects nodeModulesPaths', () => {
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

  test('respects extraNodeModules', () => {
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

test('resolves Haste modules', () => {
  expect(Resolver.resolve(CONTEXT, 'Foo', null)).toEqual({
    type: 'sourceFile',
    filePath: '/haste/Foo.js',
  });
  expect(Resolver.resolve(CONTEXT, 'Bar', null)).toEqual({
    type: 'sourceFile',
    filePath: '/haste/Bar.js',
  });
});

test('does not call resolveHasteModule for a specifier with separators', () => {
  const resolveHasteModule = jest.fn();
  expect(() =>
    Resolver.resolve(
      {
        ...CONTEXT,
        resolveHasteModule,
      },
      'Foo/bar',
      null,
    ),
  ).toThrow();
  expect(resolveHasteModule).not.toHaveBeenCalled();
});

test('resolves a Haste package', () => {
  expect(Resolver.resolve(CONTEXT, 'some-package', null)).toEqual({
    type: 'sourceFile',
    filePath: '/haste/some-package/main.js',
  });
});

test.each([
  ['simple', 'simple'],
  ['simple/with/subpath', 'simple'],
  ['@scoped/package', '@scoped/package'],
  ['@scoped/with/subpath', '@scoped/with'],
])(
  'calls resolveHastePackage for specifier %s with %s',
  (specifier, expectedHastePackageCandidate) => {
    const resolveHastePackage = jest.fn();
    expect(() =>
      Resolver.resolve(
        {
          ...CONTEXT,
          resolveHastePackage,
        },
        specifier,
        null,
      ),
    ).toThrow();
    expect(resolveHastePackage).toHaveBeenCalledWith(
      expectedHastePackageCandidate,
    );
    expect(resolveHastePackage).toHaveBeenCalledTimes(1);
  },
);

test('does not call resolveHastePackage for invalid specifier @notvalid', () => {
  const resolveHastePackage = jest.fn();
  expect(() =>
    Resolver.resolve(
      {
        ...CONTEXT,
        resolveHastePackage,
      },
      '@notvalid',
      null,
    ),
  ).toThrow();
  expect(resolveHastePackage).not.toHaveBeenCalled();
});

test('resolves a file inside a Haste package', () => {
  expect(
    Resolver.resolve(CONTEXT, 'some-package/subdir/other-file', null),
  ).toEqual({
    type: 'sourceFile',
    filePath: '/haste/some-package/subdir/other-file.js',
  });
});

test('throws a descriptive error when a file inside a Haste package cannot be resolved', () => {
  expect(() => {
    Resolver.resolve(CONTEXT, 'some-package/subdir/does-not-exist', null);
  }).toThrowErrorMatchingInlineSnapshot(`
    "While resolving module \`some-package/subdir/does-not-exist\`, the Haste package \`some-package\` was found. However the subpath \`./subdir/does-not-exist\` could not be found within the package. Indeed, none of these files exist:

      * \`/haste/some-package/subdir/does-not-exist(.js|.jsx|.json|.ts|.tsx)\`
      * \`/haste/some-package/subdir/does-not-exist\`"
  `);
});

describe('redirectModulePath', () => {
  const mockRedirectModulePath = jest.fn();
  const context = CONTEXT;

  beforeEach(() => {
    mockRedirectModulePath.mockReset();
    mockRedirectModulePath.mockImplementation(filePath => false);

    jest.resetModules();
    jest.mock('../PackageResolve', () => {
      return {
        ...jest.requireActual('../PackageResolve'),
        redirectModulePath: (_ctx, specifier) =>
          mockRedirectModulePath(specifier),
      };
    });

    Resolver = require('../index');
  });

  afterEach(() => {
    jest.unmock('../PackageResolve');
    jest.resetModules();
    Resolver = require('../index');
  });

  test('is used for relative path requests', () => {
    expect(Resolver.resolve(context, './bar', null)).toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(mockRedirectModulePath).toBeCalledTimes(1);
    expect(mockRedirectModulePath).toBeCalledWith('/root/project/bar');
  });

  test('is used for absolute path requests', () => {
    expect(Resolver.resolve(context, '/bar', null)).toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(mockRedirectModulePath).toBeCalledTimes(1);
    expect(mockRedirectModulePath).toBeCalledWith('/bar');
  });

  test('is used for non-Haste package requests', () => {
    expect(Resolver.resolve(context, 'does-not-exist', null))
      .toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(mockRedirectModulePath).toBeCalledTimes(1);
    expect(mockRedirectModulePath).toBeCalledWith('does-not-exist');
  });

  test('can redirect to an arbitrary relative module', () => {
    mockRedirectModulePath
      .mockImplementationOnce(filePath => '../smth/beep')
      .mockImplementation(filePath => filePath);
    expect(Resolver.resolve(context, 'does-not-exist', null))
      .toMatchInlineSnapshot(`
      Object {
        "filePath": "/root/smth/beep.js",
        "type": "sourceFile",
      }
    `);
    expect(mockRedirectModulePath.mock.calls).toMatchInlineSnapshot(`
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

  test("is called for source extension candidates that don't exist on disk", () => {
    mockRedirectModulePath.mockImplementation(filePath =>
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
    expect(mockRedirectModulePath.mock.calls).toMatchInlineSnapshot(`
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

  test('can resolve to empty from a candidate with an added source extension', () => {
    mockRedirectModulePath.mockImplementation(filePath =>
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
    expect(mockRedirectModulePath.mock.calls).toMatchInlineSnapshot(`
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

  test('is not called redundantly for a candidate that does exist on disk', () => {
    mockRedirectModulePath.mockImplementation(filePath => filePath);
    expect(Resolver.resolve(context, './bar', null)).toMatchInlineSnapshot(`
      Object {
        "filePath": "/root/project/bar.js",
        "type": "sourceFile",
      }
    `);
    expect(mockRedirectModulePath.mock.calls).toMatchInlineSnapshot(`
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
  // $FlowFixMe[unclear-type]: `resolveRequest` is used too dynamically.
  const resolveRequest = jest.fn<any, any>();
  const context = {...CONTEXT, resolveRequest};

  beforeEach(() => {
    resolveRequest.mockReset();
    resolveRequest.mockImplementation(() => ({type: 'empty'}));
  });

  test('is called for non-Haste package requests', () => {
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

  test('is called for relative path requests', () => {
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

  test('is called for absolute path requests', () => {
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

  test('is called for Haste packages', () => {
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

  test('is called for Haste modules', () => {
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

  test('is called with the platform and non-redirected module path', () => {
    const contextWithRedirect = {
      ...context,
      redirectModulePath: (filePath: string) => filePath + '.redirected',
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

  test('is called if redirectModulePath returns false', () => {
    resolveRequest.mockImplementation(() => ({
      type: 'sourceFile',
      filePath: '/some/fake/path',
    }));
    const contextWithRedirect = {
      ...context,
      redirectModulePath: (filePath: string) => false,
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

  test('can forward requests to the standard resolver', () => {
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

  test('can forward Haste requests to the standard resolver', () => {
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

  test('can forward requests to the standard resolver via resolveRequest', () => {
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

  test('throwing an error stops the standard resolution', () => {
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

  test('receives customResolverOptions', () => {
    expect(
      Resolver.resolve(
        {...context, customResolverOptions: {key: 'value'}},
        '/root/project/foo.js',
        'android',
      ),
    ).toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {
        ...context,
        resolveRequest: Resolver.resolve,
        customResolverOptions: {key: 'value'},
      },
      '/root/project/foo.js',
      'android',
    );
  });
});
