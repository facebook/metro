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

import Resolver from '../index';
import {createPackageAccessors, createResolutionContext} from './utils';

describe('browser field spec', () => {
  describe('alternate main fields', () => {
    const packageJson = {
      name: 'test-pkg',
      main: 'index.js',
      browser: 'index-browser.js',
      'react-native': 'index-react-native.js',
    };
    const baseContext = {
      ...createResolutionContext({
        '/root/src/main.js': '',
        '/root/node_modules/test-pkg/package.json': JSON.stringify(packageJson),
        '/root/node_modules/test-pkg/index.js': '',
        '/root/node_modules/test-pkg/index-browser.js': '',
        '/root/node_modules/test-pkg/index-react-native.js': '',
      }),
      originModulePath: '/root/src/main.js',
    };

    test('should resolve package entry point using passed `mainFields` in order', () => {
      expect(
        Resolver.resolve(
          {
            ...baseContext,
            mainFields: ['browser', 'main'],
          },
          'test-pkg',
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index-browser.js',
      });

      expect(
        Resolver.resolve(
          {
            ...baseContext,
            mainFields: ['react-native', 'browser', 'main'],
          },
          'test-pkg',
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index-react-native.js',
      });

      expect(
        Resolver.resolve(
          {
            ...baseContext,
            ...createPackageAccessors({
              '/root/node_modules/test-pkg/package.json': {
                name: 'test-pkg',
                main: 'index.js',
              },
            }),
            mainFields: ['browser', 'main'],
          },
          'test-pkg',
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index.js',
      });
    });

    test('should resolve .js and .json file extensions implicitly', () => {
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          '/root/node_modules/test-pkg/package.json': {
            ...packageJson,
            browser: 'index-browser',
          },
        }),
        mainFields: ['browser', 'main'],
      };

      expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index-browser.js',
      });
    });
  });
});
