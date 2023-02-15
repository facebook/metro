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

describe('with package exports resolution disabled', () => {
  test('should ignore "exports" field for main entry point', () => {
    const context = {
      ...createResolutionContext({
        '/root/src/main.js': '',
        '/root/node_modules/test-pkg/package.json': JSON.stringify({
          main: 'index.js',
          exports: './index-exports.js',
        }),
        '/root/node_modules/test-pkg/index.js': '',
        '/root/node_modules/test-pkg/index-exports.js': '',
      }),
      originModulePath: '/root/src/main.js',
      unstable_enablePackageExports: false,
    };

    expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
      type: 'sourceFile',
      filePath: '/root/node_modules/test-pkg/index.js',
    });
  });

  test('should ignore "exports" field for subpaths', () => {
    const context = {
      ...createResolutionContext({
        '/root/src/main.js': '',
        '/root/node_modules/test-pkg/package.json': JSON.stringify({
          main: 'index.js',
          exports: {
            './foo.js': './lib/foo.js',
          },
        }),
        '/root/node_modules/test-pkg/index.js': '',
        '/root/node_modules/test-pkg/foo.js': '',
        '/root/node_modules/test-pkg/foo.ios.js': '',
        '/root/node_modules/test-pkg/lib/foo.js': '',
      }),
      originModulePath: '/root/src/main.js',
      unstable_enablePackageExports: false,
    };

    expect(Resolver.resolve(context, 'test-pkg/foo.js', null)).toEqual({
      type: 'sourceFile',
      filePath: '/root/node_modules/test-pkg/foo.js',
    });
    expect(Resolver.resolve(context, 'test-pkg/foo', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: '/root/node_modules/test-pkg/foo.ios.js',
    });
  });
});

describe('with package exports resolution enabled', () => {
  describe('main entry point', () => {
    const baseContext = {
      ...createResolutionContext({
        '/root/src/main.js': '',
        '/root/node_modules/test-pkg/package.json': '',
        '/root/node_modules/test-pkg/index.js': '',
        '/root/node_modules/test-pkg/index-main.js': '',
        '/root/node_modules/test-pkg/index-exports.js.js': '',
        '/root/node_modules/test-pkg/index-exports.ios.js': '',
      }),
      originModulePath: '/root/src/main.js',
      unstable_enablePackageExports: true,
    };

    test('should resolve package using "exports" field', () => {
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          '/root/node_modules/test-pkg/package.json': {
            main: 'index-main.js',
            exports: {
              '.': './index.js',
            },
          },
        }),
      };

      expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index.js',
      });
    });

    test('should resolve package using "exports" field (shorthand)', () => {
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          '/root/node_modules/test-pkg/package.json': {
            main: 'index-main.js',
            exports: './index.js',
          },
        }),
      };

      expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index.js',
      });
    });

    test('should fall back to "main" field resolution when file does not exist', () => {
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          '/root/node_modules/test-pkg/package.json': {
            main: 'index-main.js',
            exports: './foo.js',
          },
        }),
      };

      expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index-main.js',
      });
      // TODO(T142200031): Assert that an invalid package warning is logged with
      // file missing message
    });

    test('should fall back to "main" field resolution when "exports" is an invalid subpath', () => {
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          '/root/node_modules/test-pkg/package.json': {
            main: 'index-main.js',
            exports: 'index.js',
          },
        }),
      };

      expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index-main.js',
      });
      // TODO(T142200031): Assert that an invalid package warning is logged with
      // invalid subpath value message
    });

    describe('should resolve "exports" target directly', () => {
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          '/root/node_modules/test-pkg/package.json': {
            main: 'index-main.js',
            exports: './index-exports.js',
          },
        }),
      };

      test('without expanding `sourceExts`', () => {
        expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/index-main.js',
        });
      });

      test('without expanding platform-specific extensions', () => {
        expect(Resolver.resolve(context, 'test-pkg', 'ios')).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/index-main.js',
        });
      });
    });
  });

  describe('subpath exports', () => {
    const baseContext = {
      ...createResolutionContext({
        '/root/src/main.js': '',
        '/root/node_modules/test-pkg/package.json': JSON.stringify({
          name: 'test-pkg',
          main: 'index.js',
          exports: {
            '.': './index.js',
            './foo.js': './lib/foo.js',
          },
        }),
        '/root/node_modules/test-pkg/index.js': '',
        '/root/node_modules/test-pkg/foo.js': '',
        '/root/node_modules/test-pkg/foo.ios.js': '',
        '/root/node_modules/test-pkg/lib/foo.js': '',
        '/root/node_modules/test-pkg/lib/foo.js.js': '',
        '/root/node_modules/test-pkg/lib/foo.ios.js': '',
        '/root/node_modules/test-pkg/private/bar.js': '',
      }),
      originModulePath: '/root/src/main.js',
      unstable_enablePackageExports: true,
    };

    test('should resolve subpath in "exports" using exact import specifier', () => {
      expect(Resolver.resolve(baseContext, 'test-pkg/foo.js', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/lib/foo.js',
      });
    });

    test('[nonstrict] should fall back to "browser" spec resolution and log inaccessible import warning', () => {
      expect(Resolver.resolve(baseContext, 'test-pkg/foo', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/foo.js',
      });
      // TODO(T142200031): Assert inaccessible import warning is logged
    });

    describe('should resolve "exports" target directly', () => {
      test('without expanding `sourceExts`', () => {
        expect(Resolver.resolve(baseContext, 'test-pkg/foo.js', null)).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/lib/foo.js',
        });
      });

      test('without expanding platform-specific extensions', () => {
        expect(Resolver.resolve(baseContext, 'test-pkg/foo.js', 'ios')).toEqual(
          {
            type: 'sourceFile',
            filePath: '/root/node_modules/test-pkg/lib/foo.js',
          },
        );
      });
    });

    describe('package encapsulation', () => {
      test('should fall back to "browser" spec resolution and log inaccessible import warning', () => {
        expect(
          Resolver.resolve(baseContext, 'test-pkg/private/bar', null),
        ).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/private/bar.js',
        });
        // TODO(T142200031): Assert inaccessible import warning is logged
      });

      test('should not log warning when no "exports" field is present', () => {
        const context = {
          ...baseContext,
          ...createPackageAccessors({
            '/root/node_modules/test-pkg/package.json': {
              main: 'index-main.js',
            },
          }),
        };

        expect(Resolver.resolve(context, 'test-pkg/private/bar', null)).toEqual(
          {
            type: 'sourceFile',
            filePath: '/root/node_modules/test-pkg/private/bar.js',
          },
        );
        // TODO(T142200031): Assert inaccessible import warning is NOT logged
      });
    });
  });

  describe('conditional exports', () => {
    const baseContext = {
      ...createResolutionContext({
        '/root/src/main.js': '',
        '/root/node_modules/test-pkg/package.json': JSON.stringify({
          name: 'test-pkg',
          main: 'index.js',
          exports: {
            './foo.js': {
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
      originModulePath: '/root/src/main.js',
      unstable_enablePackageExports: true,
    };

    test('should resolve "exports" subpath with conditions', () => {
      const context = {
        ...baseContext,
        unstable_conditionNames: ['require', 'react-native'],
      };

      expect(Resolver.resolve(context, 'test-pkg/foo.js', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/lib/foo-react-native.cjs',
      });
    });

    test('should resolve "exports" subpath with nested conditions', () => {
      const context = {
        ...baseContext,
        unstable_conditionNames: ['require', 'react-native'],
      };

      expect(Resolver.resolve(context, 'test-pkg/foo.js', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/lib/foo-react-native.cjs',
      });
    });

    test('should resolve asserted conditions in order specified by package', () => {
      const context = {
        ...baseContext,
        unstable_conditionNames: ['react-native', 'import'],
      };

      expect(Resolver.resolve(context, 'test-pkg/foo.js', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/lib/foo-module.mjs',
      });
    });

    test('should fall back to "default" condition if present', () => {
      const context = {
        ...baseContext,
        unstable_conditionNames: [],
      };

      expect(Resolver.resolve(context, 'test-pkg/foo.js', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/lib/foo.js',
      });
    });

    test('should throw FailedToResolvePathError when no conditions are matched', () => {
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          '/root/node_modules/test-pkg/package.json': {
            main: 'index.js',
            exports: {
              './foo.js': {
                import: './lib/foo-module.mjs',
                require: './lib/foo-require.cjs',
                // 'default' entry can be omitted
              },
            },
          },
        }),
        unstable_conditionNames: [],
      };

      // TODO(T145206395): Improve this error trace
      expect(() => Resolver.resolve(context, 'test-pkg/foo.js', null))
        .toThrowErrorMatchingInlineSnapshot(`
        "Module does not exist in the Haste module map or in these directories:
          /root/src/node_modules
          /root/node_modules
          /node_modules
        "
      `);
    });

    describe('unstable_conditionsByPlatform', () => {
      test('should resolve "browser" condition for `web` platform when configured', () => {
        const context = {
          ...baseContext,
          unstable_conditionNames: [],
          unstable_conditionsByPlatform: {
            web: ['browser'],
          },
        };

        expect(Resolver.resolve(context, 'test-pkg/foo.js', null)).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/lib/foo.js',
        });
        expect(Resolver.resolve(context, 'test-pkg/foo.js', 'web')).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/lib/foo-browser.js',
        });
      });

      test('should resolve using overridden per-platform conditions', () => {
        const context = {
          ...baseContext,
          unstable_conditionNames: [],
          unstable_conditionsByPlatform: {
            web: ['development', 'browser'],
          },
        };

        expect(Resolver.resolve(context, 'test-pkg/foo.js', 'web')).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/lib/foo-dev.js',
        });
        expect(
          Resolver.resolve(
            {...context, unstable_conditionsByPlatform: {}},
            'test-pkg/foo.js',
            'web',
          ),
        ).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/lib/foo.js',
        });
      });
    });

    describe('main entry point', () => {
      const baseContext = {
        ...createResolutionContext({
          '/root/src/main.js': '',
          '/root/node_modules/test-pkg/package.json': '',
          '/root/node_modules/test-pkg/index.js': '',
          '/root/node_modules/test-pkg/index-browser.js': '',
        }),
        originModulePath: '/root/src/main.js',
        unstable_enablePackageExports: true,
      };

      test('should resolve main entry point using conditional exports', () => {
        const context = {
          ...baseContext,
          ...createPackageAccessors({
            '/root/node_modules/test-pkg/package.json': {
              main: 'index-main.js',
              exports: {
                '.': {
                  browser: './index-browser.js',
                  default: './index.js',
                },
              },
            },
          }),
          unstable_conditionNames: ['browser', 'import', 'require'],
        };

        expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/index-browser.js',
        });
      });

      test('should resolve main entry point when root keys are a condition mapping (shorthand)', () => {
        const context = {
          ...baseContext,
          ...createPackageAccessors({
            '/root/node_modules/test-pkg/package.json': {
              main: 'index-main.js',
              exports: {
                browser: './index-browser.js',
                default: './index.js',
              },
            },
          }),
          unstable_conditionNames: ['browser', 'import', 'require'],
        };

        expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/index-browser.js',
        });
      });
    });
  });
});
