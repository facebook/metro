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

import {createResolutionContext} from './utils';

// Implementation of PACKAGE_IMPORTS_RESOLVE described in https://nodejs.org/api/esm.html
describe('subpath imports resolution support', () => {
  let Resolver;
  const mockRedirectModulePath = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.mock('../PackageResolve', () => ({
      ...jest.requireActual('../PackageResolve'),
      redirectModulePath: mockRedirectModulePath,
    }));
    Resolver = require('../index');
  });

  test('specifiers beginning # are reserved for future package imports support', () => {
    const mockNeverCalledFn = jest.fn();
    const mockCustomResolver = jest
      .fn()
      .mockImplementation((ctx, ...args) => ctx.resolveRequest(ctx, ...args));

    const context = {
      ...createResolutionContext({}),
      originModulePath: '/root/src/main.js',
      doesFileExist: mockNeverCalledFn,
      fileSystemLookup: mockNeverCalledFn,
      redirectModulePath: mockNeverCalledFn,
      resolveHasteModule: mockNeverCalledFn,
      resolveHastePackage: mockNeverCalledFn,
      resolveRequest: mockCustomResolver,
    };

    expect(() => Resolver.resolve(context, '#foo', null)).toThrow(
      new Resolver.FailedToResolveUnsupportedError(
        'Specifier starts with "#" but subpath imports are not currently supported.',
      ),
    );

    // Ensure any custom resolver *is* still called first.
    expect(mockCustomResolver).toBeCalledTimes(1);
    expect(mockCustomResolver).toBeCalledWith(
      expect.objectContaining({
        originModulePath: '/root/src/main.js',
      }),
      '#foo',
      null,
    );

    // Ensure package imports precedes any other attempt at resolution for a '#' specifier.
    expect(mockNeverCalledFn).not.toHaveBeenCalled();
    expect(mockRedirectModulePath).not.toHaveBeenCalled();
  });
});
