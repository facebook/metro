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
import {createResolutionContext} from './utils';
import {createPackageAccessors} from './utils';

// Implementation of PACKAGE_IMPORTS_RESOLVE described in https://nodejs.org/api/esm.html
describe('subpath imports resolution support', () => {
  const baseContext = {
    ...createResolutionContext({
      '/root/src/main.js': '',
      '/root/node_modules/test-pkg/package.json': '',
      '/root/node_modules/test-pkg/index.js': '',
      '/root/node_modules/test-pkg/index-main.js': '',
      '/root/node_modules/test-pkg/symlink.js': {
        realPath: '/root/node_modules/test-pkg/symlink-target.js',
      },
    }),
    originModulePath: '/root/src/main.js',
  };

  test('"imports" subpath that maps directly to a file', () => {
    const context = {
      ...baseContext,
      ...createPackageAccessors({
        '/root/node_modules/test-pkg/package.json': {
          main: 'index-main.js',
          imports: {
            '#foo': './index.js',
          },
        },
      }),
      originModulePath: '/root/node_modules/test-pkg/lib/foo.js',
    };

    expect(Resolver.resolve(context, '#foo', null)).toEqual({
      type: 'sourceFile',
      filePath: '/root/node_modules/test-pkg/index.js',
    });
  });
});

describe('import subpath patterns resolution support', () => {
  const baseContext = {
    ...createResolutionContext({
      '/root/src/main.js': '',
      '/root/node_modules/test-pkg/package.json': JSON.stringify({
        name: 'test-pkg',
        main: 'index.js',
        imports: {
          '#features/*': './src/features/*.js',
        },
      }),
      '/root/node_modules/test-pkg/src/index.js': '',
      '/root/node_modules/test-pkg/src/features/foo.js': '',
      '/root/node_modules/test-pkg/src/features/foo.js.js': '',
      '/root/node_modules/test-pkg/src/features/bar/Bar.js': '',
      '/root/node_modules/test-pkg/src/features/baz.native.js': '',
    }),
    originModulePath: '/root/node_modules/test-pkg/src/index.js',
  };

  test('resolving subpath patterns in "imports" matching import specifier', () => {
    expect(Resolver.resolve(baseContext, '#features/foo', null)).toEqual({
      type: 'sourceFile',
      filePath: '/root/node_modules/test-pkg/src/features/foo.js',
    });

    expect(Resolver.resolve(baseContext, '#features/foo.js', null)).toEqual({
      type: 'sourceFile',
      filePath: '/root/node_modules/test-pkg/src/features/foo.js.js',
    });
  });
});

describe('import subpath conditional imports resolution', () => {
  const baseContext = {
    ...createResolutionContext({
      '/root/src/main.js': '',
      '/root/node_modules/test-pkg/package.json': JSON.stringify({
        name: 'test-pkg',
        main: 'index.js',
        imports: {
          '#foo': {
            import: './lib/foo-module.mjs',
            development: './lib/foo-dev.js',
            'react-native': {
              import: './lib/foo-react-native.mjs',
              require: './lib/foo-react-native.cjs',
              default: './lib/foo-react-native.js',
            },
            browser: './lib/foo-browser.js',
            require: './lib/foo-require.cjs',
            default: './lib/foo.js',
          },
        },
      }),
      '/root/node_modules/test-pkg/index.js': '',
      '/root/node_modules/test-pkg/lib/foo.js': '',
      '/root/node_modules/test-pkg/lib/foo-require.cjs': '',
      '/root/node_modules/test-pkg/lib/foo-module.mjs': '',
      '/root/node_modules/test-pkg/lib/foo-dev.js': '',
      '/root/node_modules/test-pkg/lib/foo-browser.js': '',
      '/root/node_modules/test-pkg/lib/foo-react-native.cjs': '',
      '/root/node_modules/test-pkg/lib/foo-react-native.mjs': '',
      '/root/node_modules/test-pkg/lib/foo-react-native.js': '',
      '/root/node_modules/test-pkg/lib/foo.web.js': '',
    }),
    originModulePath: '/root/node_modules/test-pkg/src/index.js',
  };

  test('resolving imports subpath with conditions', () => {
    const context = {
      ...baseContext,
      unstable_conditionNames: ['require', 'react-native'],
    };

    expect(Resolver.resolve(context, '#foo', null)).toEqual({
      type: 'sourceFile',
      filePath: '/root/node_modules/test-pkg/lib/foo-react-native.cjs',
    });
  });
});
