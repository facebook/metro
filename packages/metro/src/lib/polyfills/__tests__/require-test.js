/**
 * Copyright (c) 2016-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

/* eslint-disable no-bitwise */

'use strict';

require('metro-babel-register/src/node-polyfills');

const fs = require('fs');

const {transformSync} = require('@babel/core');

// Include the external-helpers plugin to be able to detect if they're
// needed when transforming the requirejs implementation.
const PLUGINS = ['@babel/plugin-external-helpers'];

function createBabelConfig() {
  return {
    ast: false,
    babelrc: false,
    plugins: PLUGINS.map(require),
    presets: [require.resolve('metro-react-native-babel-preset')],
    retainLines: true,
    sourceMaps: 'inline',
    sourceType: 'module',
  };
}

describe('require', () => {
  const moduleSystemCode = (() => {
    const config = createBabelConfig();
    const rawCode = fs.readFileSync(require.resolve('../require'), 'utf8');
    return transformSync(rawCode, config).code;
  })();

  // eslint-disable-next-line no-new-func
  const createModuleSystem = new Function(
    'global',
    '__DEV__',
    moduleSystemCode,
  );

  let moduleSystem;

  beforeEach(() => {
    moduleSystem = {};
  });

  it('does not need any babel helper logic', () => {
    // Super-simple check to validate that no babel helpers are used.
    // This check will need to be updated if https://fburl.com/6z0y2kf8 changes.
    expect(moduleSystemCode.includes('babelHelpers')).toBe(false);
  });

  it('works with plain bundles', () => {
    createModuleSystem(moduleSystem, false);
    expect(moduleSystem.require).not.toBeUndefined();
    expect(moduleSystem.__d).not.toBeUndefined();

    const mockExports = {foo: 'bar'};
    const mockFactory = jest
      .fn()
      .mockImplementation(
        (global, require, moduleObject, exports, dependencyMap) => {
          moduleObject.exports = mockExports;
        },
      );

    moduleSystem.__d(mockFactory, 1, [2, 3]);
    expect(mockFactory).not.toBeCalled();

    const m = moduleSystem.require(1);
    expect(mockFactory.mock.calls.length).toBe(1);
    expect(mockFactory.mock.calls[0][0]).toBe(moduleSystem);
    expect(m).toBe(mockExports);
    expect(mockFactory.mock.calls[0][4]).toEqual([2, 3]);
  });

  it('works with Random Access Modules (RAM) bundles', () => {
    const mockExports = {foo: 'bar'};
    const mockFactory = jest
      .fn()
      .mockImplementation(
        (global, require, moduleObject, exports, dependencyMap) => {
          moduleObject.exports = mockExports;
        },
      );

    moduleSystem.nativeRequire = jest
      .fn()
      .mockImplementation((localId, bundleId) => {
        moduleSystem.__d(mockFactory, (bundleId << 16) + localId, [2, 3]);
      });
    createModuleSystem(moduleSystem, false);
    expect(moduleSystem.require).not.toBeUndefined();
    expect(moduleSystem.__d).not.toBeUndefined();

    expect(moduleSystem.nativeRequire).not.toBeCalled();
    expect(mockFactory).not.toBeCalled();

    const CASES = [[1, 1, 0], [42, 42, 0], [196650, 42, 3]];

    CASES.forEach(([moduleId, localId, bundleId]) => {
      moduleSystem.nativeRequire.mockClear();
      mockFactory.mockClear();

      const m = moduleSystem.require(moduleId);

      expect(moduleSystem.nativeRequire.mock.calls.length).toBe(1);
      expect(moduleSystem.nativeRequire).toBeCalledWith(localId, bundleId);

      expect(mockFactory.mock.calls.length).toBe(1);
      expect(mockFactory.mock.calls[0][0]).toBe(moduleSystem);
      expect(m).toBe(mockExports);
      expect(mockFactory.mock.calls[0][4]).toEqual([2, 3]);
    });
  });
});
