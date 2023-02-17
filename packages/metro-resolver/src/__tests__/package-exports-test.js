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

import path from 'path';
import Resolver from '../index';
import {createPackageAccessors, createResolutionContext} from './utils';

// Tests validating Package Exports resolution behaviour. See RFC0534:
// https://github.com/react-native-community/discussions-and-proposals/blob/master/proposals/0534-metro-package-exports-support.md
//
// '[nonstrict]' tests describe behaviour that is out-of-spec, but which Metro
// supports at feature launch for backwards compatibility. A future strict mode
// for exports will disable these features.

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
      unstable_getRealPath: null,
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

    const logWarning = jest.fn();

    expect(
      Resolver.resolve(
        {...context, unstable_logWarning: logWarning},
        'test-pkg/foo',
        'ios',
      ),
    ).toEqual({
      type: 'sourceFile',
      filePath: '/root/node_modules/test-pkg/foo.ios.js',
    });
    expect(logWarning).not.toHaveBeenCalled();
  });

  test('should ignore invalid "exports" field', () => {
    const context = {
      ...createResolutionContext({
        '/root/src/main.js': '',
        '/root/node_modules/test-pkg/package.json': JSON.stringify({
          main: 'index.js',
          exports: {
            '.': './index-exports.js',
            browser: './index.js',
          },
        }),
        '/root/node_modules/test-pkg/index.js': '',
      }),
      originModulePath: '/root/src/main.js',
      unstable_enablePackageExports: false,
    };

    expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
      type: 'sourceFile',
      filePath: '/root/node_modules/test-pkg/index.js',
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

    test('[nonstrict] should fall back to "main" field resolution when file does not exist', () => {
      const logWarning = jest.fn();
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          '/root/node_modules/test-pkg/package.json': {
            main: 'index-main.js',
            exports: './foo.js',
          },
        }),
        unstable_logWarning: logWarning,
      };

      expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index-main.js',
      });
      expect(logWarning).toHaveBeenCalledTimes(1);
      expect(logWarning.mock.calls[0][0]).toMatchInlineSnapshot(`
        "The package /root/node_modules/test-pkg contains an invalid package.json configuration. Consider raising this issue with the package maintainer(s).
        Reason: The resolution for \\"/root/node_modules/test-pkg\\" defined in \\"exports\\" is /root/node_modules/test-pkg/foo.js, however this file does not exist. Falling back to file-based resolution."
      `);
    });

    test('[nonstrict] should fall back to "main" field resolution when "exports" is an invalid subpath', () => {
      const logWarning = jest.fn();
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          '/root/node_modules/test-pkg/package.json': {
            main: 'index-main.js',
            exports: 'index.js',
          },
        }),
        unstable_logWarning: logWarning,
      };

      expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index-main.js',
      });
      expect(logWarning).toHaveBeenCalledTimes(1);
      expect(logWarning.mock.calls[0][0]).toMatchInlineSnapshot(`
        "The package /root/node_modules/test-pkg contains an invalid package.json configuration. Consider raising this issue with the package maintainer(s).
        Reason: One or more mappings for subpaths defined in \\"exports\\" are invalid. All values must begin with \\"./\\". Falling back to file-based resolution."
      `);
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
            './baz': './node_modules/baz/index.js',
          },
        }),
        '/root/node_modules/test-pkg/index.js': '',
        '/root/node_modules/test-pkg/foo.js': '',
        '/root/node_modules/test-pkg/foo.ios.js': '',
        '/root/node_modules/test-pkg/lib/foo.js': '',
        '/root/node_modules/test-pkg/lib/foo.js.js': '',
        '/root/node_modules/test-pkg/lib/foo.ios.js': '',
        '/root/node_modules/test-pkg/private/bar.js': '',
        '/root/node_modules/test-pkg/node_modules/baz/index.js': '',
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
      const logWarning = jest.fn();
      const context = {
        ...baseContext,
        unstable_logWarning: logWarning,
      };

      expect(Resolver.resolve(context, 'test-pkg/foo', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/foo.js',
      });
      expect(logWarning).toHaveBeenCalledTimes(1);
      expect(logWarning.mock.calls[0][0]).toMatchInlineSnapshot(
        `"Attempted to import the module \\"/root/node_modules/test-pkg/foo\\" which is not listed in the \\"exports\\" of \\"/root/node_modules/test-pkg\\". Falling back to file-based resolution. Consider updating the call site or asking the package maintainer(s) to expose this API."`,
      );
    });

    test('[nonstrict] should fall back and log warning for an invalid "exports" target value', () => {
      const logWarning = jest.fn();
      const context = {
        ...baseContext,
        unstable_logWarning: logWarning,
      };

      // TODO(T145206395): Improve this error trace
      expect(() => Resolver.resolve(context, 'test-pkg/baz', null))
        .toThrowErrorMatchingInlineSnapshot(`
        "Module does not exist in the Haste module map or in these directories:
          /root/src/node_modules
          /root/node_modules
          /node_modules
        "
      `);
      expect(logWarning).toHaveBeenCalledTimes(1);
      expect(logWarning.mock.calls[0][0]).toMatchInlineSnapshot(`
        "The package /root/node_modules/test-pkg contains an invalid package.json configuration. Consider raising this issue with the package maintainer(s).
        Reason: The target for \\"./baz\\" defined in \\"exports\\" is \\"./node_modules/baz/index.js\\", however this value is an invalid subpath or subpath pattern because it includes \\"node_modules\\". Falling back to file-based resolution."
      `);
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
      test('[nonstrict] should fall back to "browser" spec resolution and log inaccessible import warning', () => {
        const logWarning = jest.fn();
        const context = {
          ...baseContext,
          unstable_logWarning: logWarning,
        };

        expect(Resolver.resolve(context, 'test-pkg/private/bar', null)).toEqual(
          {
            type: 'sourceFile',
            filePath: '/root/node_modules/test-pkg/private/bar.js',
          },
        );
        expect(logWarning).toHaveBeenCalledTimes(1);
        expect(logWarning.mock.calls[0][0]).toMatchInlineSnapshot(
          `"Attempted to import the module \\"/root/node_modules/test-pkg/private/bar\\" which is not listed in the \\"exports\\" of \\"/root/node_modules/test-pkg\\". Falling back to file-based resolution. Consider updating the call site or asking the package maintainer(s) to expose this API."`,
        );
      });

      test('should not log warning when no "exports" field is present', () => {
        const logWarning = jest.fn();
        const context = {
          ...baseContext,
          ...createPackageAccessors({
            '/root/node_modules/test-pkg/package.json': {
              main: 'index-main.js',
            },
          }),
          unstable_logWarning: logWarning,
        };

        expect(Resolver.resolve(context, 'test-pkg/private/bar', null)).toEqual(
          {
            type: 'sourceFile',
            filePath: '/root/node_modules/test-pkg/private/bar.js',
          },
        );
        expect(logWarning).not.toHaveBeenCalled();
      });
    });
  });

  describe('subpath patterns', () => {
    const baseContext = {
      ...createResolutionContext({
        '/root/src/main.js': '',
        '/root/node_modules/test-pkg/package.json': JSON.stringify({
          name: 'test-pkg',
          main: 'index.js',
          exports: {
            './features/*.js': './src/features/*.js',
            './features/bar/*.js': {
              'react-native': null,
            },
            './assets/*': './assets/*',
          },
        }),
        '/root/node_modules/test-pkg/src/features/foo.js': '',
        '/root/node_modules/test-pkg/src/features/foo.js.js': '',
        '/root/node_modules/test-pkg/src/features/bar/Bar.js': '',
        '/root/node_modules/test-pkg/src/features/baz.native.js': '',
        '/root/node_modules/test-pkg/src/features/node_modules/foo/index.js':
          '',
        '/root/node_modules/test-pkg/assets/Logo.js': '',
      }),
      originModulePath: '/root/src/main.js',
      unstable_enablePackageExports: true,
    };

    test('should resolve subpath patterns in "exports" matching import specifier', () => {
      for (const [importSpecifier, filePath] of [
        [
          'test-pkg/features/foo.js',
          '/root/node_modules/test-pkg/src/features/foo.js',
        ],
        // Valid: Subpath patterns allow the match to be any substring between
        // the pattern base and pattern trailer
        [
          'test-pkg/features/foo.js.js',
          '/root/node_modules/test-pkg/src/features/foo.js.js',
        ],
        [
          'test-pkg/features/bar/Bar.js',
          '/root/node_modules/test-pkg/src/features/bar/Bar.js',
        ],
      ]) {
        expect(Resolver.resolve(baseContext, importSpecifier, null)).toEqual({
          type: 'sourceFile',
          filePath,
        });
      }

      expect(() =>
        Resolver.resolve(baseContext, 'test-pkg/features/foo', null),
      ).toThrowError();
      expect(() =>
        Resolver.resolve(baseContext, 'test-pkg/features/baz.js', null),
      ).toThrowError();
    });

    test('should use most specific pattern base', () => {
      const context = {
        ...baseContext,
        unstable_conditionNames: ['react-native'],
      };

      // TODO(T145206395): Improve this error trace
      expect(() =>
        Resolver.resolve(context, 'test-pkg/features/bar/Bar.js', null),
      ).toThrowErrorMatchingInlineSnapshot(`
        "Module does not exist in the Haste module map or in these directories:
          /root/src/node_modules
          /root/node_modules
          /node_modules
        "
      `);
    });

    test('[nonstrict] should fall back and log warning for an invalid pattern match substitution', () => {
      const logWarning = jest.fn();
      const context = {
        ...baseContext,
        unstable_logWarning: logWarning,
      };

      // TODO(T145206395): Improve this error trace
      expect(() =>
        Resolver.resolve(
          context,
          'test-pkg/features/node_modules/foo/index.js',
          null,
        ),
      ).toThrowErrorMatchingInlineSnapshot(`
        "Module does not exist in the Haste module map or in these directories:
          /root/src/node_modules
          /root/node_modules
          /node_modules
        "
      `);
      expect(logWarning).toHaveBeenCalledTimes(1);
      expect(logWarning.mock.calls[0][0]).toMatchInlineSnapshot(`
        "Invalid import specifier /root/node_modules/test-pkg/features/node_modules/foo/index.js.
        Reason: The target for \\"./features/node_modules/foo/index.js\\" defined in \\"exports\\" is \\"./src/features/*.js\\", however this expands to an invalid subpath because the pattern match \\"node_modules/foo/index\\" is invalid. Falling back to file-based resolution."
      `);
    });

    describe('package encapsulation', () => {
      test('[nonstrict] should fall back to "browser" spec resolution and log inaccessible import warning', () => {
        const logWarning = jest.fn();
        const context = {
          ...baseContext,
          unstable_logWarning: logWarning,
        };

        expect(
          Resolver.resolve(context, 'test-pkg/assets/Logo.js', null),
        ).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/assets/Logo.js',
        });
        expect(logWarning).not.toHaveBeenCalled();
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

    describe('package encapsulation', () => {
      test('[nonstrict] should fall back to "browser" spec resolution and log inaccessible import warning', () => {
        const logWarning = jest.fn();
        const context = {
          ...baseContext,
          ...createPackageAccessors({
            '/root/node_modules/test-pkg/package.json': {
              main: 'index.js',
              exports: {
                './lib/foo.js': {
                  import: './lib/foo-module.mjs',
                  require: './lib/foo-require.cjs',
                  // 'default' entry can be omitted
                },
              },
            },
          }),
          unstable_conditionNames: [],
          unstable_logWarning: logWarning,
        };

        expect(Resolver.resolve(context, 'test-pkg/lib/foo.js', null)).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/lib/foo.js',
        });
        expect(logWarning).toHaveBeenCalledTimes(1);
        expect(logWarning.mock.calls[0][0]).toMatchInlineSnapshot(
          `"Attempted to import the module \\"/root/node_modules/test-pkg/lib/foo.js\\" which is listed in the \\"exports\\" of \\"/root/node_modules/test-pkg, however no match was resolved for thisrequest (platform = null). Falling back to file-based resolution. Consider updating the call site or asking the package maintainer(s) to expose this API."`,
        );
      });
    });
  });

  describe('asset resolutions', () => {
    const assetResolutions = ['1', '1.5', '2', '3', '4'];
    const isAssetFile = (filePath: string) => filePath.endsWith('.png');

    const baseContext = {
      ...createResolutionContext({
        '/root/src/main.js': '',
        '/root/node_modules/test-pkg/package.json': JSON.stringify({
          main: './index.js',
          exports: {
            './icons/metro.png': './assets/icons/metro.png',
          },
        }),
        '/root/node_modules/test-pkg/assets/icons/metro.png': '',
        '/root/node_modules/test-pkg/assets/icons/metro@2x.png': '',
        '/root/node_modules/test-pkg/assets/icons/metro@3x.png': '',
      }),
      isAssetFile,
      originModulePath: '/root/src/main.js',
      unstable_enablePackageExports: true,
    };

    test('should resolve assets using "exports" field and calling `resolveAsset`', () => {
      const resolveAsset = jest.fn(
        (dirPath: string, basename: string, extension: string) => {
          const basePath = dirPath + path.sep + basename;
          const assets = [
            basePath + extension,
            ...assetResolutions.map(
              resolution => basePath + '@' + resolution + 'x' + extension,
            ),
          ].filter(candidate => baseContext.doesFileExist(candidate));

          return assets.length ? assets : null;
        },
      );
      const context = {
        ...baseContext,
        resolveAsset,
      };

      expect(
        Resolver.resolve(context, 'test-pkg/icons/metro.png', null),
      ).toEqual({
        type: 'assetFiles',
        filePaths: [
          '/root/node_modules/test-pkg/assets/icons/metro.png',
          '/root/node_modules/test-pkg/assets/icons/metro@2x.png',
          '/root/node_modules/test-pkg/assets/icons/metro@3x.png',
        ],
      });
      expect(resolveAsset).toHaveBeenLastCalledWith(
        '/root/node_modules/test-pkg/assets/icons',
        'metro',
        '.png',
      );
    });
  });
});
