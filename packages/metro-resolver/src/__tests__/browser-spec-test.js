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

import Resolver from '../index';
import {createResolutionContext} from './utils';

const files = {
  '/root/src/main.js': '',
  '/root/node_modules/test-pkg/package.json': '',
  '/root/node_modules/test-pkg/index.js': '',
  '/root/node_modules/test-pkg/index-browser.js': '',
  '/root/node_modules/test-pkg/index-react-native.js': '',
};

describe('browser field spec', () => {
  describe('alternate main fields', () => {
    const resolveTestPkg = (context: $Partial<ResolutionContext>) =>
      Resolver.resolve(
        {
          ...createResolutionContext(files),
          originModulePath: '/root/src/main.js',
          ...context,
        },
        'test-pkg',
        null,
      );
    const packageJson = {
      name: 'test-pkg',
      main: 'index.js',
      browser: 'index-browser.js',
      'react-native': 'index-react-native.js',
    };

    test('should resolve package entry point using passed `mainFields` in order', () => {
      expect(
        resolveTestPkg({
          getPackage: () => packageJson,
          mainFields: ['browser', 'main'],
        }),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index-browser.js',
      });

      expect(
        resolveTestPkg({
          getPackage: () => packageJson,
          mainFields: ['react-native', 'browser', 'main'],
        }),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index-react-native.js',
      });

      expect(
        resolveTestPkg({
          getPackage: () => ({
            name: 'test-pkg',
            main: 'index.js',
          }),
          mainFields: ['browser', 'main'],
        }),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index.js',
      });
    });

    test('should resolve .js and .json file extensions implicitly', () => {
      expect(
        resolveTestPkg({
          getPackage: () => ({
            ...packageJson,
            browser: 'index-browser',
          }),
          mainFields: ['browser', 'main'],
        }),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index-browser.js',
      });
    });
  });
});
