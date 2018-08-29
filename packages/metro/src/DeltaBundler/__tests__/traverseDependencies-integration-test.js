/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

const path = require('path');

jest.useRealTimers();
jest
  // It's noticeably faster to prevent running watchman from FileWatcher.
  .mock('child_process', () => ({}))
  .mock('os', () => ({
    platform: () => 'test',
    tmpdir: () => (process.platform === 'win32' ? 'C:\\tmp' : '/tmp'),
    hostname: () => 'testhost',
    endianness: () => 'LE',
  }))
  .mock('graceful-fs', () => require('fs'));

// Super-simple mock for extracting dependencies
const extractDependencies = function(sourceCode: string) {
  const regexp = /require\s*\(\s*(['"])(.*?)\1\s*\)/g;
  const deps = [];
  let match;

  while ((match = regexp.exec(sourceCode))) {
    deps.push({name: match[2], isAsync: false});
  }

  return deps;
};

jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

beforeEach(() => {
  jest.resetModules();
  jest.mock('path', () => require.requireActual('path'));
});

describe('traverseDependencies', function() {
  let fs;
  let traverseDependencies;
  let transformFile;
  let transformHelpers;
  let defaults;
  let UnableToResolveError;

  const getOrderedDependenciesAsJSON = async function(
    dgraphPromise,
    entryPath,
    platform,
    recursive = true,
  ) {
    const dgraph = await dgraphPromise;

    const graph = {
      dependencies: new Map(),
      entryPoints: [entryPath],
    };

    const bundler = {
      getDependencyGraph() {
        return Promise.resolve(dgraph);
      },
    };

    const {added} = await traverseDependencies.initialTraverseDependencies(
      graph,
      {
        resolve: await transformHelpers.getResolveDependencyFn(
          bundler,
          platform,
        ),
        transform: async path => {
          let dependencies = [];
          const sourceCode = fs.readFileSync(path, 'utf8');

          if (!path.endsWith('.json')) {
            dependencies = extractDependencies(sourceCode);
          }
          return {dependencies, output: {code: sourceCode}};
        },
      },
    );

    const dependencies = recursive
      ? [...added.values()].map(module => module.path)
      : [...graph.dependencies.get(entryPath).dependencies.values()].map(
          m => m.absolutePath,
        );

    return await Promise.all(
      [...dependencies].map(async path => {
        const transformResult = await transformFile(path);

        return {
          path,
          dependencies: transformResult.dependencies,
        };
      }),
    );
  };

  beforeEach(function() {
    jest.resetModules();
    jest.mock('fs', () => new (require('metro-memory-fs'))());

    fs = require('fs');
    traverseDependencies = require('../traverseDependencies');
    transformHelpers = require('../../lib/transformHelpers');
    ({
      UnableToResolveError,
    } = require('../../node-haste/DependencyGraph/ModuleResolution'));

    defaults = {
      assetExts: ['png', 'jpg'],
      // This pattern is not expected to match anything.
      blacklistRE: /.^/,
      cacheStores: [],
      providesModuleNodeModules: ['haste-fbjs', 'react-haste', 'react-native'],
      platforms: new Set(['ios', 'android']),
      mainFields: ['react-native', 'browser', 'main'],
      maxWorkers: 1,
      resetCache: true,
      getTransformCacheKey: () => 'abcdef',
      reporter: require('../../lib/reporting').nullReporter,
      sourceExts: ['js', 'json'],
      watch: true,
    };

    transformFile = async filePath => {
      // require call must stay inline, so the latest defined mock is used!
      const code = require('fs').readFileSync(filePath, 'utf8');
      const deps = {dependencies: []};

      if (!filePath.endsWith('.json')) {
        deps.dependencies = extractDependencies(code);
      }

      return {...deps, code};
    };
  });

  describe('get sync dependencies (posix)', () => {
    let DependencyGraph;
    let processDgraph;
    const consoleWarn = console.warn;
    beforeEach(function() {
      Object.defineProperty(process, 'platform', {
        configurable: true,
        enumerable: true,
        value: 'linux',
      });

      DependencyGraph = require('../../node-haste/DependencyGraph');
      processDgraph = processDgraphFor.bind(null, DependencyGraph);
    });

    afterEach(function() {
      console.warn = consoleWarn;
    });

    it('should get dependencies', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("a")',
          ].join('\n'),
          'a.js': ['/**', ' * @providesModule a', ' */', 'require("b")'].join(
            '\n',
          ),
          'b.js': ['/**', ' * @providesModule b', ' */'].join('\n'),
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should get shallow dependencies', async function() {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("a")',
          ].join('\n'),
          'a.js': ['/**', ' * @providesModule a', ' */', 'require("b")'].join(
            '\n',
          ),
          'b.js': ['/**', ' * @providesModule b', ' */'].join('\n'),
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
          null,
          false,
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should get dependencies with the correct extensions', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("a")',
          ].join('\n'),
          'a.js': ['/**', ' * @providesModule a', ' */'].join('\n'),
          'a.js.orig': ['/**', ' * @providesModule a', ' */'].join('\n'),
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should get json dependencies', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'package.json': JSON.stringify({
            name: 'package',
          }),
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("./a.json")',
            'require("./b")',
          ].join('\n'),
          'a.json': JSON.stringify({}),
          'b.json': JSON.stringify({}),
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should get package json as a dep', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'package.json': JSON.stringify({
            name: 'package',
          }),
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("./package.json")',
          ].join('\n'),
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should get dependencies with relative assets', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("./imgs/a.png")',
          ].join('\n'),
          imgs: {
            'a.png': '',
          },
          'package.json': JSON.stringify({
            name: 'rootPackage',
          }),
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should get dependencies with assets and resolution', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("./imgs/a.png");',
            'require("./imgs/b.png");',
            'require("./imgs/c.png");',
          ].join('\n'),
          imgs: {
            'a@1.5x.png': '',
            'b@.7x.png': '',
            'c.png': '',
            'c@2x.png': '',
          },
          'package.json': JSON.stringify({
            name: 'rootPackage',
          }),
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should respect platform extension in assets', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("./imgs/a.png");',
            'require("./imgs/b.png");',
            'require("./imgs/c.png");',
          ].join('\n'),
          imgs: {
            'a@1.5x.ios.png': '',
            'b@.7x.ios.png': '',
            'c.ios.png': '',
            'c@2x.ios.png': '',
          },
          'package.json': JSON.stringify({
            name: 'rootPackage',
          }),
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
          'ios',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should get recursive dependencies', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("a")',
          ].join('\n'),
          'a.js': [
            '/**',
            ' * @providesModule a',
            ' */',
            'require("index")',
          ].join('\n'),
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should work with packages', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("aPackage")',
          ].join('\n'),
          aPackage: {
            'package.json': JSON.stringify({
              name: 'aPackage',
              main: 'main.js',
            }),
            'main.js': 'lol',
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should work with packages with a trailing slash', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("aPackage/")',
          ].join('\n'),
          aPackage: {
            'package.json': JSON.stringify({
              name: 'aPackage',
              main: 'main.js',
            }),
            'main.js': 'lol',
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should work with packages with a dot in the name', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("sha.js")',
            'require("x.y.z")',
          ].join('\n'),
          'sha.js': {
            'package.json': JSON.stringify({
              name: 'sha.js',
              main: 'main.js',
            }),
            'main.js': 'lol',
          },
          'x.y.z': {
            'package.json': JSON.stringify({
              name: 'x.y.z',
              main: 'main.js',
            }),
            'main.js': 'lol',
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should default main package to index.js', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': 'require("aPackage")',
          aPackage: {
            'package.json': JSON.stringify({
              name: 'aPackage',
            }),
            'index.js': 'lol',
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should resolve using alternative ids', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': 'require("aPackage")',
          aPackage: {
            'package.json': JSON.stringify({
              name: 'aPackage',
            }),
            'index.js': ['/**', ' * @providesModule EpicModule', ' */'].join(
              '\n',
            ),
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should default use index.js if main is a dir', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': 'require("aPackage")',
          aPackage: {
            'package.json': JSON.stringify({
              name: 'aPackage',
              main: 'lib',
            }),
            lib: {
              'index.js': 'lol',
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should resolve require to index if it is a dir', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'package.json': JSON.stringify({
            name: 'test',
          }),
          'index.js': 'require("./lib/")',
          lib: {
            'index.js': 'lol',
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should resolve require to main if it is a dir w/ a package.json', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'package.json': JSON.stringify({
            name: 'test',
          }),
          'index.js': 'require("./lib/")',
          lib: {
            'package.json': JSON.stringify({
              main: 'main.js',
            }),
            'index.js': 'lol',
            'main.js': 'lol',
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should ignore malformed packages', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': ['/**', ' * @providesModule index', ' */'].join('\n'),
          aPackage: {
            'package.json': '{}',
            'main.js': 'lol',
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should fatal on multiple modules with the same name', async () => {
      const root = '/root';
      console.warn = jest.fn();
      setMockFileSystem({
        root: {
          'index.js': ['/**', ' * @providesModule index', ' */'].join('\n'),
          'b.js': ['/**', ' * @providesModule index', ' */'].join('\n'),
        },
      });

      const opts = {...defaults, watchFolders: [root]};

      try {
        await processDgraph(opts, async dgraph => {});
        throw new Error('should be unreachable');
      } catch (error) {
        expect(error.message).toEqual(
          [
            'jest-haste-map: @providesModule naming collision:',
            '  Duplicate module name: index',
            '  Paths: /root/b.js collides with /root/index.js',
            '',
            'This error is caused by a @providesModule declaration with the ' +
              'same name across two different files.',
          ].join('\n'),
        );
      }
    });

    it('throws when a module is missing', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("lolomg")',
          ].join('\n'),
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        try {
          await getOrderedDependenciesAsJSON(dgraph, '/root/index.js');
          throw new Error('should be unreachable');
        } catch (error) {
          if (!(error instanceof UnableToResolveError)) {
            throw error;
          }
          expect(error.originModulePath).toBe('/root/index.js');
          expect(error.targetModuleName).toBe('lolomg');
        }
      });
    });

    it('should work with packages with subdirs', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("aPackage/subdir/lolynot")',
          ].join('\n'),
          aPackage: {
            'package.json': JSON.stringify({
              name: 'aPackage',
              main: 'main.js',
            }),
            'main.js': 'lol',
            subdir: {
              'lolynot.js': 'lolynot',
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should work with relative modules in packages', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("aPackage")',
          ].join('\n'),
          aPackage: {
            'package.json': JSON.stringify({
              name: 'aPackage',
              main: 'main.js',
            }),
            'main.js': 'require("./subdir/lolynot")',
            subdir: {
              'lolynot.js': 'require("../other")',
            },
            'other.js': '/* some code */',
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    testBrowserField('browser');
    testBrowserField('react-native');

    function resolveRequest(context, moduleName, platform) {
      return {
        type: 'sourceFile',
        filePath: path.resolve(
          path.dirname(context.originModulePath),
          moduleName,
        ),
      };
    }

    function replaceBrowserField(json, fieldName) {
      if (fieldName !== 'browser') {
        json[fieldName] = json.browser;
        delete json.browser;
      }

      return json;
    }

    function testBrowserField(fieldName) {
      it(
        'should support simple browser field in packages ("' + fieldName + '")',
        async () => {
          var root = '/root';
          setMockFileSystem({
            root: {
              'index.js': [
                '/**',
                ' * @providesModule index',
                ' */',
                'require("aPackage")',
              ].join('\n'),
              aPackage: {
                'package.json': JSON.stringify(
                  replaceBrowserField(
                    {
                      name: 'aPackage',
                      main: 'main.js',
                      browser: 'client.js',
                    },
                    fieldName,
                  ),
                ),
                'main.js': 'some other code',
                'client.js': '/* some code */',
              },
            },
          });

          const opts = {...defaults, watchFolders: [root]};
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/index.js',
            );
            expect(deps).toMatchSnapshot();
          });
        },
      );

      it(
        'should support browser field in packages w/o .js ext ("' +
          fieldName +
          '")',
        async () => {
          var root = '/root';
          setMockFileSystem({
            root: {
              'index.js': [
                '/**',
                ' * @providesModule index',
                ' */',
                'require("aPackage")',
              ].join('\n'),
              aPackage: {
                'package.json': JSON.stringify(
                  replaceBrowserField(
                    {
                      name: 'aPackage',
                      main: 'main.js',
                      browser: 'client',
                    },
                    fieldName,
                  ),
                ),
                'main.js': 'some other code',
                'client.js': '/* some code */',
              },
            },
          });

          const opts = {...defaults, watchFolders: [root]};
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/index.js',
            );
            expect(deps).toMatchSnapshot();
          });
        },
      );

      it(
        'should support mapping main in browser field json ("' +
          fieldName +
          '")',
        async () => {
          var root = '/root';
          setMockFileSystem({
            root: {
              'index.js': [
                '/**',
                ' * @providesModule index',
                ' */',
                'require("aPackage")',
              ].join('\n'),
              aPackage: {
                'package.json': JSON.stringify(
                  replaceBrowserField(
                    {
                      name: 'aPackage',
                      main: './main.js',
                      browser: {
                        './main.js': './client.js',
                      },
                    },
                    fieldName,
                  ),
                ),
                'main.js': 'some other code',
                'client.js': '/* some code */',
              },
            },
          });

          const opts = {
            ...defaults,
            assetExts: ['png', 'jpg'],
            watchFolders: [root],
          };
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/index.js',
            );
            expect(deps).toMatchSnapshot();
          });
        },
      );

      it(`should support mapping main in browser field json without path prefix ("${fieldName}")`, async () => {
        var root = '/root';
        setMockFileSystem({
          root: {
            'index.js': [
              '/**',
              ' * @providesModule index',
              ' */',
              'require("aPackage")',
            ].join('\n'),
            aPackage: {
              'package.json': JSON.stringify(
                replaceBrowserField(
                  {
                    name: 'aPackage',
                    main: 'main.js',
                    browser: {
                      './main.js': './client.js',
                    },
                  },
                  fieldName,
                ),
              ),
              'main.js': 'some other code',
              'client.js': '/* some code */',
            },
          },
        });

        const opts = {
          ...defaults,
          assetExts: ['png', 'jpg'],
          watchFolders: [root],
        };
        await processDgraph(opts, async dgraph => {
          const deps = await getOrderedDependenciesAsJSON(
            dgraph,
            '/root/index.js',
          );
          expect(deps).toMatchSnapshot();
        });
      });

      it(
        'should work do correct browser mapping w/o js ext ("' +
          fieldName +
          '")',
        async () => {
          var root = '/root';
          setMockFileSystem({
            root: {
              'index.js': [
                '/**',
                ' * @providesModule index',
                ' */',
                'require("aPackage")',
              ].join('\n'),
              aPackage: {
                'package.json': JSON.stringify(
                  replaceBrowserField(
                    {
                      name: 'aPackage',
                      main: './main.js',
                      browser: {
                        './main': './client.js',
                      },
                    },
                    fieldName,
                  ),
                ),
                'main.js': 'some other code',
                'client.js': '/* some code */',
              },
            },
          });

          const opts = {
            ...defaults,
            assetExts: ['png', 'jpg'],
            watchFolders: [root],
          };
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/index.js',
            );
            expect(deps).toMatchSnapshot();
          });
        },
      );

      it(
        'should support browser mapping of files ("' + fieldName + '")',
        async () => {
          var root = '/root';
          setMockFileSystem({
            root: {
              'index.js': [
                '/**',
                ' * @providesModule index',
                ' */',
                'require("aPackage")',
              ].join('\n'),
              aPackage: {
                'package.json': JSON.stringify(
                  replaceBrowserField(
                    {
                      name: 'aPackage',
                      main: './main.js',
                      browser: {
                        './main': './client.js',
                        './node.js': './not-node.js',
                        './not-browser': './browser.js',
                        './dir/server.js': './dir/client',
                        './hello.js': './bye.js',
                      },
                    },
                    fieldName,
                  ),
                ),
                'main.js': '/* some other code */',
                'client.js': 'require("./node")\nrequire("./dir/server.js")',
                'not-node.js': 'require("./not-browser")',
                'not-browser.js': 'require("./dir/server")',
                'browser.js': '/* some browser code */',
                dir: {
                  'server.js': '/* some node code */',
                  'client.js': 'require("../hello")',
                },
                'hello.js': '/* hello */',
                'bye.js': '/* bye */',
              },
            },
          });

          const opts = {...defaults, watchFolders: [root]};
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/index.js',
            );
            expect(deps).toMatchSnapshot();
          });
        },
      );

      it(
        'should support browser mapping for packages ("' + fieldName + '")',
        async () => {
          var root = '/root';
          setMockFileSystem({
            root: {
              'index.js': [
                '/**',
                ' * @providesModule index',
                ' */',
                'require("aPackage")',
              ].join('\n'),
              aPackage: {
                'package.json': JSON.stringify(
                  replaceBrowserField(
                    {
                      name: 'aPackage',
                      browser: {
                        'node-package': 'browser-package',
                      },
                    },
                    fieldName,
                  ),
                ),
                'index.js': 'require("node-package")',
                'node-package': {
                  'package.json': JSON.stringify({
                    name: 'node-package',
                  }),
                  'index.js': '/* some node code */',
                },
                'browser-package': {
                  'package.json': JSON.stringify({
                    name: 'browser-package',
                  }),
                  'index.js': '/* some browser code */',
                },
              },
            },
          });

          const opts = {...defaults, watchFolders: [root]};
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/index.js',
            );
            expect(deps).toMatchSnapshot();
          });
        },
      );

      it(
        'should support browser mapping of a package to a file ("' +
          fieldName +
          '")',
        async () => {
          var root = '/root';
          setMockFileSystem({
            root: {
              'index.js': [
                '/**',
                ' * @providesModule index',
                ' */',
                'require("aPackage")',
              ].join('\n'),
              aPackage: {
                'package.json': JSON.stringify(
                  replaceBrowserField(
                    {
                      name: 'aPackage',
                      browser: {
                        'node-package': './dir/browser.js',
                      },
                    },
                    fieldName,
                  ),
                ),
                'index.js': 'require("./dir/ooga")',
                dir: {
                  'ooga.js': 'require("node-package")',
                  'browser.js': '/* some browser code */',
                },
                'node-package': {
                  'package.json': JSON.stringify({
                    name: 'node-package',
                  }),
                  'index.js': '/* some node code */',
                },
              },
            },
          });

          const opts = {...defaults, watchFolders: [root]};
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/index.js',
            );
            expect(deps).toMatchSnapshot();
          });
        },
      );

      it(
        'should support browser mapping for packages ("' + fieldName + '")',
        async () => {
          var root = '/root';
          setMockFileSystem({
            root: {
              'index.js': [
                '/**',
                ' * @providesModule index',
                ' */',
                'require("aPackage")',
              ].join('\n'),
              aPackage: {
                'package.json': JSON.stringify(
                  replaceBrowserField(
                    {
                      name: 'aPackage',
                      browser: {
                        'node-package': 'browser-package',
                      },
                    },
                    fieldName,
                  ),
                ),
                'index.js': 'require("node-package")',
                'node-package': {
                  'package.json': JSON.stringify({
                    name: 'node-package',
                  }),
                  'index.js': '/* some node code */',
                },
                'browser-package': {
                  'package.json': JSON.stringify({
                    name: 'browser-package',
                  }),
                  'index.js': '/* some browser code */',
                },
              },
            },
          });

          const opts = {...defaults, watchFolders: [root]};
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/index.js',
            );
            expect(deps).toMatchSnapshot();
          });
        },
      );

      it(
        'should support browser mapping for relative requires ("' +
          fieldName +
          '")',
        async () => {
          var root = '/root';
          setMockFileSystem({
            root: {
              aPackage: {
                'package.json': JSON.stringify(
                  replaceBrowserField(
                    {
                      name: 'aPackage',
                      browser: {
                        './file-node.js': './file-browser.js',
                      },
                    },
                    fieldName,
                  ),
                ),
                'index.js': 'require("./file-node.js")',
                'file-browser.js': '/* browser file */',
                'file-node.js': '/* node file */',
              },
            },
          });

          const opts = {...defaults, watchFolders: [root], resolveRequest};
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/aPackage/index.js',
            );
            expect(deps).toMatchSnapshot();
          });
        },
      );

      it(
        'should support browser mapping for relative requires from deep within the package ("' +
          fieldName +
          '")',
        async () => {
          var root = '/root';
          setMockFileSystem({
            root: {
              aPackage: {
                'package.json': JSON.stringify(
                  replaceBrowserField(
                    {
                      name: 'aPackage',
                      browser: {
                        './file-node.js': './file-browser.js',
                      },
                    },
                    fieldName,
                  ),
                ),
                subfolder: {
                  'index.js': 'require("../file-node.js")',
                },
                'file-browser.js': '/* browser file */',
                'file-node.js': '/* node file */',
              },
            },
          });

          const opts = {...defaults, watchFolders: [root], resolveRequest};
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/aPackage/subfolder/index.js',
            );
            expect(deps).toMatchSnapshot();
          });
        },
      );

      it(
        'should support browser exclude of a package ("' + fieldName + '")',
        async () => {
          require('../../node-haste/DependencyGraph/ModuleResolution').ModuleResolver.EMPTY_MODULE =
            '/root/emptyModule.js';
          var root = '/root';
          setMockFileSystem({
            root: {
              'emptyModule.js': '',
              'index.js': [
                '/**',
                ' * @providesModule index',
                ' */',
                'require("aPackage")',
              ].join('\n'),
              aPackage: {
                'package.json': JSON.stringify(
                  replaceBrowserField(
                    {
                      name: 'aPackage',
                      browser: {
                        booga: false,
                      },
                    },
                    fieldName,
                  ),
                ),
                'index.js': 'require("booga")',
                booga: {
                  'package.json': JSON.stringify({
                    name: 'booga',
                  }),
                  'index.js': '/* some node code */',
                },
              },
            },
          });

          const opts = {...defaults, watchFolders: [root]};
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/index.js',
            );
            expect(deps).toMatchSnapshot();
          });
        },
      );

      it(
        'should support browser exclude of a file ("' + fieldName + '")',
        async () => {
          require('../../node-haste/DependencyGraph/ModuleResolution').ModuleResolver.EMPTY_MODULE =
            '/root/emptyModule.js';

          var root = '/root';
          setMockFileSystem({
            root: {
              'emptyModule.js': '',
              'index.js': [
                '/**',
                ' * @providesModule index',
                ' */',
                'require("aPackage")',
              ].join('\n'),
              aPackage: {
                'package.json': JSON.stringify(
                  replaceBrowserField(
                    {
                      name: 'aPackage',
                      browser: {
                        './booga.js': false,
                      },
                    },
                    fieldName,
                  ),
                ),
                'index.js': 'require("./booga")',
                'booga.js': '/* some node code */',
              },
            },
          });

          const opts = {...defaults, watchFolders: [root]};
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/index.js',
            );
            expect(deps).toMatchSnapshot();
          });
        },
      );
    }

    it('should fall back to browser mapping from react-native mapping', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("aPackage")',
          ].join('\n'),
          aPackage: {
            'package.json': JSON.stringify({
              name: 'aPackage',
              'react-native': {
                'node-package': 'rn-package',
              },
            }),
            'index.js': 'require("node-package")',
            node_modules: {
              'node-package': {
                'package.json': JSON.stringify({
                  name: 'node-package',
                }),
                'index.js': '/* some node code */',
              },
              'rn-package': {
                'package.json': JSON.stringify({
                  name: 'rn-package',
                  browser: {
                    'nested-package': 'nested-browser-package',
                  },
                }),
                'index.js': 'require("nested-package")',
              },
              'nested-browser-package': {
                'package.json': JSON.stringify({
                  name: 'nested-browser-package',
                }),
                'index.js': '/* some code */',
              },
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should work with custom main fields', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("aPackage")',
          ].join('\n'),
          aPackage: {
            'package.json': JSON.stringify({
              name: 'aPackage',
              'custom-field': {
                'my-package': 'rn-package',
              },
              browser: {
                'my-package': 'node-package',
              },
            }),
            'index.js': 'require("my-package")',
            node_modules: {
              'node-package': {
                'package.json': JSON.stringify({
                  name: 'node-package',
                }),
                'index.js': '/* some node code */',
              },
              'rn-package': {
                'package.json': JSON.stringify({
                  name: 'rn-package',
                  browser: {
                    'nested-package': 'nested-browser-package',
                  },
                }),
                'index.js': 'require("nested-package")',
              },
              'nested-browser-package': {
                'package.json': JSON.stringify({
                  name: 'nested-browser-package',
                }),
                'index.js': '/* some code */',
              },
            },
          },
        },
      });

      const opts = {
        ...defaults,
        mainFields: ['custom-field', 'browser'],
        watchFolders: [root],
      };
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should work with absolute paths', async () => {
      const root = '/root';
      setMockFileSystem({
        [root.slice(1)]: {
          'index.js': 'require("/root/apple.js");',
          'apple.js': '',
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should merge browser mapping with react-native mapping', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("aPackage")',
          ].join('\n'),
          aPackage: {
            'package.json': JSON.stringify({
              name: 'aPackage',
              'react-native': {
                // should see this:
                'node-package-a': 'rn-package-a',
                // should see this:
                'node-package-c': 'rn-package-d',
              },
              browser: {
                // should see this:
                'node-package-b': 'rn-package-b',
                // should NOT see this:
                'node-package-c': 'rn-package-c',
              },
            }),
            'index.js':
              'require("node-package-a"); require("node-package-b"); require("node-package-c");',
            node_modules: {
              'node-package-a': {
                'package.json': JSON.stringify({
                  name: 'node-package-a',
                }),
                'index.js': '/* some node code */',
              },
              'node-package-b': {
                'package.json': JSON.stringify({
                  name: 'node-package-b',
                }),
                'index.js': '/* some node code */',
              },
              'node-package-c': {
                'package.json': JSON.stringify({
                  name: 'node-package-c',
                }),
                'index.js': '/* some node code */',
              },
              'node-package-d': {
                'package.json': JSON.stringify({
                  name: 'node-package-d',
                }),
                'index.js': '/* some node code */',
              },
              'rn-package-a': {
                'package.json': JSON.stringify({
                  name: 'rn-package-a',
                }),
                'index.js': '/* some rn code */',
              },
              'rn-package-b': {
                'package.json': JSON.stringify({
                  name: 'rn-package-b',
                }),
                'index.js': '/* some rn code */',
              },
              'rn-package-c': {
                'package.json': JSON.stringify({
                  name: 'rn-package-c',
                }),
                'index.js': '/* some rn code */',
              },
              'rn-package-d': {
                'package.json': JSON.stringify({
                  name: 'rn-package-d',
                }),
                'index.js': '/* some rn code */',
              },
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should fall back to `extraNodeModules`', async () => {
      const root = '/root';
      setMockFileSystem({
        [root.slice(1)]: {
          'index.js': 'require("./foo")',
          foo: {
            'index.js': 'require("bar")',
          },
          'provides-bar': {
            'package.json': '{"main": "lib/bar.js"}',
            lib: {
              'bar.js': '',
            },
          },
        },
      });

      const opts = {
        ...defaults,
        watchFolders: [root],
        extraNodeModules: {
          bar: root + '/provides-bar',
        },
      };
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should only use `extraNodeModules` after checking all possible filesystem locations', async () => {
      const root = '/root';
      setMockFileSystem({
        [root.slice(1)]: {
          'index.js': 'require("bar")',
          node_modules: {'bar.js': ''},
          'provides-bar': {'index.js': ''},
        },
      });

      const opts = {
        ...defaults,
        watchFolders: [root],
        extraNodeModules: {
          bar: root + '/provides-bar',
        },
      };
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should be able to resolve paths within `extraNodeModules`', async () => {
      const root = '/root';
      setMockFileSystem({
        [root.slice(1)]: {
          'index.js': 'require("bar/lib/foo")',
          'provides-bar': {
            'package.json': '{}',
            lib: {'foo.js': ''},
          },
        },
      });

      const opts = {
        ...defaults,
        watchFolders: [root],
        extraNodeModules: {
          bar: root + '/provides-bar',
        },
      };
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should be able to resolve scoped `extraNodeModules`', async () => {
      var root = '/root';
      setMockFileSystem({
        [root.slice(1)]: {
          'index.js': 'require("@org/bar/lib/foo")',
          'provides-bar': {
            'package.json': '{}',
            lib: {'foo.js': ''},
          },
        },
      });

      const opts = {
        ...defaults,
        watchFolders: [root],
        extraNodeModules: {
          '@org/bar': root + '/provides-bar',
        },
      };
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });
  });

  describe('get sync dependencies (win32)', () => {
    let DependencyGraph;
    let processDgraph;
    beforeEach(function() {
      Object.defineProperty(process, 'platform', {
        configurable: true,
        enumerable: true,
        value: 'win32',
      });

      // reload path module
      jest.resetModules();
      jest.mock('path', () => require.requireActual('path').win32);
      jest.mock(
        'fs',
        () => new (require('metro-memory-fs'))({platform: 'win32'}),
      );

      fs = require('fs');

      require('os').tmpdir = () => 'c:\\tmp';
      DependencyGraph = require('../../node-haste/DependencyGraph');
      processDgraph = processDgraphFor.bind(null, DependencyGraph);
    });

    it('should get dependencies', async () => {
      const root = 'C:\\root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("a")',
          ].join('\n'),
          'a.js': ['/**', ' * @providesModule a', ' */', 'require("b")'].join(
            '\n',
          ),
          'b.js': ['/**', ' * @providesModule b', ' */'].join('\n'),
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should work with absolute paths', async () => {
      const root = 'C:\\root';
      setMockFileSystem({
        root: {
          'index.js': 'require("C:/root/apple.js");',
          'apple.js': '',
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should get dependencies with assets and resolution', async () => {
      const root = 'C:\\root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("./imgs/a.png");',
            'require("./imgs/b.png");',
            'require("./imgs/c.png");',
          ].join('\n'),
          imgs: {
            'a@1.5x.png': '',
            'b@.7x.png': '',
            'c.png': '',
            'c@2x.png': '',
          },
          'package.json': JSON.stringify({
            name: 'rootPackage',
          }),
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });
  });

  describe('node_modules (posix)', function() {
    let DependencyGraph;
    let processDgraph;

    beforeEach(function() {
      Object.defineProperty(process, 'platform', {
        configurable: true,
        enumerable: true,
        value: 'linux',
      });

      DependencyGraph = require('../../node-haste/DependencyGraph');
      processDgraph = processDgraphFor.bind(null, DependencyGraph);
    });

    it('should work with nested node_modules', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("foo");',
            'require("bar");',
          ].join('\n'),
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
                main: 'main.js',
              }),
              'main.js': 'require("bar");\n/* foo module */',
              node_modules: {
                bar: {
                  'package.json': JSON.stringify({
                    name: 'bar',
                    main: 'main.js',
                  }),
                  'main.js': '/* bar 1 module */',
                },
              },
            },
            bar: {
              'package.json': JSON.stringify({
                name: 'bar',
                main: 'main.js',
              }),
              'main.js': '/* bar 2 module */',
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('platform should work with node_modules', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.ios.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("foo");',
            'require("bar");',
          ].join('\n'),
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
              }),
              'index.ios.js': '',
            },
            bar: {
              'package.json': JSON.stringify({
                name: 'bar',
                main: 'main',
              }),
              'main.ios.js': '',
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.ios.js',
          'ios',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('nested node_modules with specific paths', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("foo");',
            'require("bar/");',
          ].join('\n'),
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
                main: 'main.js',
              }),
              'main.js': 'require("bar/lol");\n/* foo module */',
              node_modules: {
                bar: {
                  'package.json': JSON.stringify({
                    name: 'bar',
                    main: 'main.js',
                  }),
                  'main.js': '/* bar 1 module */',
                  'lol.js': '',
                },
              },
            },
            bar: {
              'package.json': JSON.stringify({
                name: 'bar',
                main: 'main.js',
              }),
              'main.js': '/* bar 2 module */',
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('nested node_modules with browser field', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("foo");',
            'require("bar");',
          ].join('\n'),
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
                main: 'main.js',
              }),
              'main.js': 'require("bar/lol");\n/* foo module */',
              node_modules: {
                bar: {
                  'package.json': JSON.stringify({
                    name: 'bar',
                    main: 'main.js',
                    browser: {
                      './lol': './wow',
                    },
                  }),
                  'main.js': '/* bar 1 module */',
                  'lol.js': '',
                  'wow.js': '',
                },
              },
            },
            bar: {
              'package.json': JSON.stringify({
                name: 'bar',
                browser: './main2',
              }),
              'main2.js': '/* bar 2 module */',
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('node_modules should support multi level', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("bar");',
          ].join('\n'),
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
                main: 'main.js',
              }),
              'main.js': '',
            },
          },
          path: {
            to: {
              'bar.js': [
                '/**',
                ' * @providesModule bar',
                ' */',
                'require("foo")',
              ].join('\n'),
            },
            node_modules: {},
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should selectively ignore providesModule in node_modules', async () => {
      var root = '/root';
      var otherRoot = '/anotherRoot';
      const filesystem = {
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("shouldWork");',
            'require("dontWork");',
            'require("wontWork");',
            'require("ember");',
            'require("internalVendoredPackage");',
            'require("anotherIndex");',
          ].join('\n'),
          node_modules: {
            'react-haste': {
              'package.json': JSON.stringify({
                name: 'react-haste',
                main: 'main.js',
              }),
              // @providesModule should not be ignored here, because react-haste is whitelisted
              'main.js': [
                '/**',
                ' * @providesModule shouldWork',
                ' */',
                'require("submodule");',
              ].join('\n'),
              node_modules: {
                bar: {
                  'package.json': JSON.stringify({
                    name: 'bar',
                    main: 'main.js',
                  }),
                  // @providesModule should be ignored here, because it's not whitelisted
                  'main.js': [
                    '/**',
                    ' * @providesModule dontWork',
                    ' */',
                    'hi();',
                  ].join('\n'),
                },
                submodule: {
                  'package.json': JSON.stringify({
                    name: 'submodule',
                    main: 'main.js',
                  }),
                  'main.js': 'log()',
                },
              },
            },
            ember: {
              'package.json': JSON.stringify({
                name: 'ember',
                main: 'main.js',
              }),
              // @providesModule should be ignored here, because it's not whitelisted,
              // and also, the modules "id" should be ember/main.js, not it's haste name
              'main.js': [
                '/**',
                ' * @providesModule wontWork',
                ' */',
                'hi();',
              ].join('\n'),
            },
          },
          // This part of the dep graph is meant to emulate internal facebook infra.
          // By whitelisting `vendored_modules`, haste should still work.
          vendored_modules: {
            'a-vendored-package': {
              'package.json': JSON.stringify({
                name: 'a-vendored-package',
                main: 'main.js',
              }),
              // @providesModule should _not_ be ignored here, because it's whitelisted.
              'main.js': [
                '/**',
                ' * @providesModule internalVendoredPackage',
                ' */',
                'hiFromInternalPackage();',
              ].join('\n'),
            },
          },
        },
        // we need to support multiple roots and using haste between them
        anotherRoot: {
          'index.js': [
            '/**',
            ' * @providesModule anotherIndex',
            ' */',
            'wazup()',
          ].join('\n'),
        },
      };
      setMockFileSystem(filesystem);

      const opts = {...defaults, watchFolders: [root, otherRoot]};
      await processDgraph(opts, async dgraph => {
        try {
          await getOrderedDependenciesAsJSON(dgraph, '/root/index.js');
          throw new Error('should be unreachable');
        } catch (error) {
          if (!(error instanceof UnableToResolveError)) {
            throw error;
          }
          expect(error.originModulePath).toBe('/root/index.js');
          expect(error.targetModuleName).toBe('dontWork');
        }
        return triggerAndProcessWatchEvent(dgraph, () => {
          const fs = require('fs');
          const code = fs.readFileSync(root + '/index.js', 'utf8');
          fs.writeFileSync(
            root + '/index.js',
            code
              .replace('require("dontWork")', '')
              .replace('require("wontWork")', ''),
          );
        })
          .then(() => getOrderedDependenciesAsJSON(dgraph, '/root/index.js'))
          .then(deps => {
            expect(deps).toMatchSnapshot();
          });
      });
    });

    it('should not be confused by prev occuring whitelisted names', async () => {
      var root = '/react-haste';
      setMockFileSystem({
        'react-haste': {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("shouldWork");',
          ].join('\n'),
          node_modules: {
            'react-haste': {
              'package.json': JSON.stringify({
                name: 'react-haste',
                main: 'main.js',
              }),
              'main.js': ['/**', ' * @providesModule shouldWork', ' */'].join(
                '\n',
              ),
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/react-haste/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should work with node packages with a .js in the name', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("sha.js")',
          ].join('\n'),
          node_modules: {
            'sha.js': {
              'package.json': JSON.stringify({
                name: 'sha.js',
                main: 'main.js',
              }),
              'main.js': 'lol',
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should work with multiple platforms (haste)', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.ios.js': `
            /**
             * @providesModule index
             */
             require('a');
          `,
          'a.ios.js': `
            /**
             * @providesModule a
             */
          `,
          'a.android.js': `
            /**
             * @providesModule a
             */
          `,
          'a.js': `
            /**
             * @providesModule a
             */
          `,
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.ios.js',
          'ios',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should pick the generic file', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.ios.js': `
            /**
             * @providesModule index
             */
             require('a');
          `,
          'a.android.js': `
            /**
             * @providesModule a
             */
          `,
          'a.js': `
            /**
             * @providesModule a
             */
          `,
          'a.web.js': `
            /**
             * @providesModule a
             */
          `,
        },
      });

      const opts = {
        ...defaults,
        platforms: new Set(['ios', 'android', 'web']),
        watchFolders: [root],
      };
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.ios.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should work with multiple platforms (node)', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.ios.js': `
            /**
             * @providesModule index
             */
             require('./a');
          `,
          'a.ios.js': '',
          'a.android.js': '',
          'a.js': '',
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.ios.js',
          'ios',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should require package.json', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("foo/package.json");',
            'require("bar");',
          ].join('\n'),
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
                main: 'main.js',
              }),
            },
            bar: {
              'package.json': JSON.stringify({
                name: 'bar',
                main: 'main.js',
              }),
              'main.js': 'require("./package.json")',
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should work with one-character node_modules', async () => {
      const root = '/root';
      setMockFileSystem({
        [root.slice(1)]: {
          'index.js': 'require("a/index.js");',
          node_modules: {
            a: {
              'package.json': '{"name": "a", "version": "1.2.3"}',
              'index.js': '',
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });
  });

  describe('node_modules (win32)', function() {
    let DependencyGraph;
    let processDgraph;
    let UnableToResolveError;

    beforeEach(() => {
      Object.defineProperty(process, 'platform', {
        configurable: true,
        enumerable: true,
        value: 'win32',
      });

      // reload path module
      jest.resetModules();
      jest.mock('path', () => require.requireActual('path').win32);
      jest.mock(
        'fs',
        () => new (require('metro-memory-fs'))({platform: 'win32'}),
      );
      require('os').tmpdir = () => 'c:\\tmp';

      fs = require('fs');
      DependencyGraph = require('../../node-haste/DependencyGraph');
      processDgraph = processDgraphFor.bind(null, DependencyGraph);
      ({
        UnableToResolveError,
      } = require('../../node-haste/DependencyGraph/ModuleResolution'));
    });

    it('should work with nested node_modules', async () => {
      var root = 'C:\\root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("foo");',
            'require("bar");',
          ].join('\n'),
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
                main: 'main.js',
              }),
              'main.js': 'require("bar");\n/* foo module */',
              node_modules: {
                bar: {
                  'package.json': JSON.stringify({
                    name: 'bar',
                    main: 'main.js',
                  }),
                  'main.js': '/* bar 1 module */',
                },
              },
            },
            bar: {
              'package.json': JSON.stringify({
                name: 'bar',
                main: 'main.js',
              }),
              'main.js': '/* bar 2 module */',
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('platform should work with node_modules', async () => {
      var root = 'C:\\root';
      setMockFileSystem({
        root: {
          'index.ios.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("foo");',
            'require("bar");',
          ].join('\n'),
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
              }),
              'index.ios.js': '',
            },
            bar: {
              'package.json': JSON.stringify({
                name: 'bar',
                main: 'main',
              }),
              'main.ios.js': '',
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.ios.js',
          'ios',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('nested node_modules with specific paths', async () => {
      var root = 'C:\\root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("foo");',
            'require("bar/");',
          ].join('\n'),
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
                main: 'main.js',
              }),
              'main.js': 'require("bar/lol");\n/* foo module */',
              node_modules: {
                bar: {
                  'package.json': JSON.stringify({
                    name: 'bar',
                    main: 'main.js',
                  }),
                  'main.js': '/* bar 1 module */',
                  'lol.js': '',
                },
              },
            },
            bar: {
              'package.json': JSON.stringify({
                name: 'bar',
                main: 'main.js',
              }),
              'main.js': '/* bar 2 module */',
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('nested node_modules with browser field', async () => {
      var root = 'C:\\root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("foo");',
            'require("bar");',
          ].join('\n'),
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
                main: 'main.js',
              }),
              'main.js': 'require("bar/lol");\n/* foo module */',
              node_modules: {
                bar: {
                  'package.json': JSON.stringify({
                    name: 'bar',
                    main: 'main.js',
                    browser: {
                      './lol': './wow',
                    },
                  }),
                  'main.js': '/* bar 1 module */',
                  'lol.js': '',
                  'wow.js': '',
                },
              },
            },
            bar: {
              'package.json': JSON.stringify({
                name: 'bar',
                browser: './main2',
              }),
              'main2.js': '/* bar 2 module */',
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('node_modules should support multi level', async () => {
      var root = 'C:\\root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("bar");',
          ].join('\n'),
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
                main: 'main.js',
              }),
              'main.js': '',
            },
          },
          path: {
            to: {
              'bar.js': [
                '/**',
                ' * @providesModule bar',
                ' */',
                'require("foo")',
              ].join('\n'),
            },
            node_modules: {},
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should selectively ignore providesModule in node_modules', async () => {
      var root = 'C:\\root';
      var otherRoot = 'C:\\anotherRoot';
      const filesystem = {
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("shouldWork");',
            'require("dontWork");',
            'require("wontWork");',
            'require("ember");',
            'require("internalVendoredPackage");',
            'require("anotherIndex");',
          ].join('\n'),
          node_modules: {
            'react-haste': {
              'package.json': JSON.stringify({
                name: 'react-haste',
                main: 'main.js',
              }),
              // @providesModule should not be ignored here, because react-haste is whitelisted
              'main.js': [
                '/**',
                ' * @providesModule shouldWork',
                ' */',
                'require("submodule");',
              ].join('\n'),
              node_modules: {
                bar: {
                  'package.json': JSON.stringify({
                    name: 'bar',
                    main: 'main.js',
                  }),
                  // @providesModule should be ignored here, because it's not whitelisted
                  'main.js': [
                    '/**',
                    ' * @providesModule dontWork',
                    ' */',
                    'hi();',
                  ].join('\n'),
                },
                submodule: {
                  'package.json': JSON.stringify({
                    name: 'submodule',
                    main: 'main.js',
                  }),
                  'main.js': 'log()',
                },
              },
            },
            ember: {
              'package.json': JSON.stringify({
                name: 'ember',
                main: 'main.js',
              }),
              // @providesModule should be ignored here, because it's not whitelisted,
              // and also, the modules "id" should be ember/main.js, not it's haste name
              'main.js': [
                '/**',
                ' * @providesModule wontWork',
                ' */',
                'hi();',
              ].join('\n'),
            },
          },
          // This part of the dep graph is meant to emulate internal facebook infra.
          // By whitelisting `vendored_modules`, haste should still work.
          vendored_modules: {
            'a-vendored-package': {
              'package.json': JSON.stringify({
                name: 'a-vendored-package',
                main: 'main.js',
              }),
              // @providesModule should _not_ be ignored here, because it's whitelisted.
              'main.js': [
                '/**',
                ' * @providesModule internalVendoredPackage',
                ' */',
                'hiFromInternalPackage();',
              ].join('\n'),
            },
          },
        },
        // we need to support multiple roots and using haste between them
        anotherRoot: {
          'index.js': [
            '/**',
            ' * @providesModule anotherIndex',
            ' */',
            'wazup()',
          ].join('\n'),
        },
      };
      setMockFileSystem(filesystem);

      const opts = {...defaults, watchFolders: [root, otherRoot]};
      const entryPath = 'C:\\root\\index.js';
      await processDgraph(opts, async dgraph => {
        try {
          await getOrderedDependenciesAsJSON(dgraph, entryPath);
          throw new Error('should be unreachable');
        } catch (error) {
          if (!(error instanceof UnableToResolveError)) {
            throw error;
          }
          expect(error.originModulePath).toBe('C:\\root\\index.js');
          expect(error.targetModuleName).toBe('dontWork');
        }
        await triggerAndProcessWatchEvent(dgraph, () => {
          const fs = require('fs');
          fs.writeFileSync(
            entryPath,
            fs
              .readFileSync(entryPath, 'utf8')
              .replace('require("dontWork")', '')
              .replace('require("wontWork")', ''),
          );
        });
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toMatchSnapshot();
      });
    });

    it('should not be confused by prev occuring whitelisted names', async () => {
      var root = 'C:\\react-haste';
      setMockFileSystem({
        'react-haste': {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("shouldWork");',
          ].join('\n'),
          node_modules: {
            'react-haste': {
              'package.json': JSON.stringify({
                name: 'react-haste',
                main: 'main.js',
              }),
              'main.js': ['/**', ' * @providesModule shouldWork', ' */'].join(
                '\n',
              ),
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\react-haste\\index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should work with node packages with a .js in the name', async () => {
      var root = 'C:\\root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("sha.js")',
          ].join('\n'),
          node_modules: {
            'sha.js': {
              'package.json': JSON.stringify({
                name: 'sha.js',
                main: 'main.js',
              }),
              'main.js': 'lol',
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should work with multiple platforms (haste)', async () => {
      var root = 'C:\\root';
      setMockFileSystem({
        root: {
          'index.ios.js': `
            /**
             * @providesModule index
             */
             require('a');
          `,
          'a.ios.js': `
            /**
             * @providesModule a
             */
          `,
          'a.android.js': `
            /**
             * @providesModule a
             */
          `,
          'a.js': `
            /**
             * @providesModule a
             */
          `,
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.ios.js',
          'ios',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should pick the generic file', async () => {
      var root = 'C:\\root';
      setMockFileSystem({
        root: {
          'index.ios.js': `
            /**
             * @providesModule index
             */
             require('a');
          `,
          'a.android.js': `
            /**
             * @providesModule a
             */
          `,
          'a.js': `
            /**
             * @providesModule a
             */
          `,
          'a.web.js': `
            /**
             * @providesModule a
             */
          `,
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.ios.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should work with multiple platforms (node)', async () => {
      var root = 'C:\\root';
      setMockFileSystem({
        root: {
          'index.ios.js': `
            /**
             * @providesModule index
             */
             require('./a');
          `,
          'a.ios.js': '',
          'a.android.js': '',
          'a.js': '',
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.ios.js',
          'ios',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('should require package.json', async () => {
      var root = 'C:\\root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("foo/package.json");',
            'require("bar");',
          ].join('\n'),
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
                main: 'main.js',
              }),
            },
            bar: {
              'package.json': JSON.stringify({
                name: 'bar',
                main: 'main.js',
              }),
              'main.js': 'require("./package.json")',
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.js',
        );
        expect(deps).toMatchSnapshot();
      });
    });
  });

  describe('file watch updating', function() {
    let DependencyGraph;
    let processDgraph;
    let fs;

    beforeEach(function() {
      Object.defineProperty(process, 'platform', {
        configurable: true,
        enumerable: true,
        value: 'linux',
      });

      DependencyGraph = require('../../node-haste/DependencyGraph');
      processDgraph = processDgraphFor.bind(null, DependencyGraph);
      fs = require('fs');
    });

    it('updates module dependencies', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("aPackage")',
            'require("foo")',
          ].join('\n'),
          'foo.js': [
            '/**',
            ' * @providesModule foo',
            ' */',
            'require("aPackage")',
          ].join('\n'),
          aPackage: {
            'package.json': JSON.stringify({
              name: 'aPackage',
              main: 'main.js',
            }),
            'main.js': 'main',
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      const entryPath = '/root/index.js';
      await processDgraph(opts, async dgraph => {
        await getOrderedDependenciesAsJSON(dgraph, entryPath);
        await triggerAndProcessWatchEvent(dgraph, () => {
          fs.writeFileSync(
            entryPath,
            fs.readFileSync(entryPath, 'utf8').replace('require("foo")', ''),
          );
        });
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toMatchSnapshot();
      });
    });

    it('updates module dependencies on file change', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("aPackage")',
            'require("foo")',
          ].join('\n'),
          'foo.js': [
            '/**',
            ' * @providesModule foo',
            ' */',
            'require("aPackage")',
          ].join('\n'),
          aPackage: {
            'package.json': JSON.stringify({
              name: 'aPackage',
              main: 'main.js',
            }),
            'main.js': 'main',
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      const entryPath = '/root/index.js';
      await processDgraph(opts, async dgraph => {
        await getOrderedDependenciesAsJSON(dgraph, entryPath);
        await triggerAndProcessWatchEvent(dgraph, () => {
          fs.writeFileSync(
            entryPath,
            fs.readFileSync(entryPath, 'utf8').replace('require("foo")', ''),
          );
        });
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toMatchSnapshot();
      });
    });

    it('updates module dependencies on file delete', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("aPackage")',
            'require("foo")',
          ].join('\n'),
          'foo.js': [
            '/**',
            ' * @providesModule foo',
            ' */',
            'require("aPackage")',
          ].join('\n'),
          aPackage: {
            'package.json': JSON.stringify({
              name: 'aPackage',
              main: 'main.js',
            }),
            'main.js': 'main',
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      const entryPath = '/root/index.js';
      await processDgraph(opts, async dgraph => {
        await getOrderedDependenciesAsJSON(dgraph, entryPath);
        await triggerAndProcessWatchEvent(dgraph, () => {
          fs.unlinkSync(root + '/foo.js');
        });
        try {
          await getOrderedDependenciesAsJSON(dgraph, '/root/index.js');
          throw new Error('should be unreachable');
        } catch (error) {
          if (!(error instanceof UnableToResolveError)) {
            throw error;
          }
          expect(error.originModulePath).toBe('/root/index.js');
          expect(error.targetModuleName).toBe('foo');
        }
      });
    });

    it('updates module dependencies on file add', async () => {
      expect.assertions(1);
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("aPackage")',
            'require("foo")',
          ].join('\n'),
          'foo.js': [
            '/**',
            ' * @providesModule foo',
            ' */',
            'require("aPackage")',
          ].join('\n'),
          aPackage: {
            'package.json': JSON.stringify({
              name: 'aPackage',
              main: 'main.js',
            }),
            'main.js': 'main',
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      const entryPath = '/root/index.js';
      await processDgraph(opts, async dgraph => {
        await getOrderedDependenciesAsJSON(dgraph, entryPath);
        await triggerAndProcessWatchEvent(dgraph, () => {
          fs.writeFileSync(
            root + '/bar.js',
            ['/**', ' * @providesModule bar', ' */', 'require("foo")'].join(
              '\n',
            ),
          );
          fs.writeFileSync(root + '/aPackage/main.js', 'require("bar")');
        });
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toMatchSnapshot();
      });
    });

    it('updates module dependencies on relative asset add', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("./foo.png")',
          ].join('\n'),
          'package.json': JSON.stringify({
            name: 'aPackage',
          }),
        },
      });

      const opts = {...defaults, assetExts: ['png'], watchFolders: [root]};
      const entryPath = '/root/index.js';
      await processDgraph(opts, async dgraph => {
        try {
          await getOrderedDependenciesAsJSON(dgraph, entryPath);
          throw new Error('should be unreachable');
        } catch (error) {
          if (!(error instanceof UnableToResolveError)) {
            throw error;
          }
          expect(error.originModulePath).toBe('/root/index.js');
          expect(error.targetModuleName).toBe('./foo.png');
        }
        await triggerAndProcessWatchEvent(dgraph, () => {
          fs.writeFileSync(root + '/foo.png', '');
        });
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toMatchSnapshot();
      });
    });

    it('changes to browser field', async () => {
      expect.assertions(1);
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("aPackage")',
          ].join('\n'),
          aPackage: {
            'package.json': JSON.stringify({
              name: 'aPackage',
              main: 'main.js',
            }),
            'main.js': 'main',
            'browser.js': 'browser',
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      const entryPath = '/root/index.js';
      await processDgraph(opts, async dgraph => {
        await getOrderedDependenciesAsJSON(dgraph, entryPath);
        await triggerAndProcessWatchEvent(dgraph, () => {
          fs.writeFileSync(
            root + '/aPackage/package.json',
            JSON.stringify({
              name: 'aPackage',
              main: 'main.js',
              browser: 'browser.js',
            }),
          );
        });
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toMatchSnapshot();
      });
    });

    it('removes old package from cache', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("aPackage")',
          ].join('\n'),
          aPackage: {
            'package.json': JSON.stringify({
              name: 'aPackage',
              main: 'main.js',
            }),
            'main.js': 'main',
            'browser.js': 'browser',
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      const entryPath = '/root/index.js';
      await processDgraph(opts, async dgraph => {
        await getOrderedDependenciesAsJSON(dgraph, entryPath);
        await triggerAndProcessWatchEvent(dgraph, () => {
          fs.writeFileSync(
            root + '/index.js',
            [
              '/**',
              ' * @providesModule index',
              ' */',
              'require("bPackage")',
            ].join('\n'),
          );
          fs.writeFileSync(
            root + '/aPackage/package.json',
            JSON.stringify({
              name: 'bPackage',
              main: 'main.js',
            }),
          );
        });
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toMatchSnapshot();
      });
    });

    it('should update node package changes', async () => {
      expect.assertions(2);
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("foo");',
          ].join('\n'),
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
                main: 'main.js',
              }),
              'main.js': 'require("bar");\n/* foo module */',
              node_modules: {
                bar: {
                  'package.json': JSON.stringify({
                    name: 'bar',
                    main: 'main.js',
                  }),
                  'main.js': '/* bar 1 module */',
                },
              },
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      const entryPath = '/root/index.js';
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toMatchSnapshot();

        await triggerAndProcessWatchEvent(dgraph, () => {
          fs.writeFileSync(root + '/node_modules/foo/main.js', 'lol');
        });
        const deps2 = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps2).toMatchSnapshot();
      });
    });

    it('should update node package main changes', async () => {
      expect.assertions(1);
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("foo");',
          ].join('\n'),
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
                main: 'main.js',
              }),
              'main.js': '/* foo module */',
              'browser.js': '/* foo module */',
            },
          },
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      const entryPath = '/root/index.js';
      await processDgraph(opts, async dgraph => {
        await getOrderedDependenciesAsJSON(dgraph, entryPath);
        await triggerAndProcessWatchEvent(dgraph, () => {
          fs.writeFileSync(
            root + '/node_modules/foo/package.json',
            JSON.stringify({
              name: 'foo',
              main: 'main.js',
              browser: 'browser.js',
            }),
          );
        });
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toMatchSnapshot();
      });
    });

    it('should recover from multiple modules with the same name', async () => {
      const root = '/root';
      console.warn = jest.fn();
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            "require('a')",
            "require('b')",
          ].join('\n'),
          'a.js': ['/**', ' * @providesModule a', ' */'].join('\n'),
          'b.js': ['/**', ' * @providesModule b', ' */'].join('\n'),
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      const entryPath = '/root/index.js';
      await processDgraph(opts, async dgraph => {
        await getOrderedDependenciesAsJSON(dgraph, entryPath);
        await triggerAndProcessWatchEvent(dgraph, () => {
          fs.writeFileSync(
            root + '/b.js',
            ['/**', ' * @providesModule a', ' */'].join('\n'),
          );
        });
        try {
          await getOrderedDependenciesAsJSON(dgraph, entryPath);
          throw new Error('expected `getOrderedDependenciesAsJSON` to fail');
        } catch (error) {
          const {AmbiguousModuleResolutionError} = require('metro-core');
          if (!(error instanceof AmbiguousModuleResolutionError)) {
            throw error;
          }
          expect(console.warn).toBeCalled();
        }
        await triggerAndProcessWatchEvent(dgraph, () => {
          fs.writeFileSync(
            root + '/b.js',
            ['/**', ' * @providesModule b', ' */'].join('\n'),
          );
        });
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toMatchSnapshot();
      });
    });
  });

  describe('Extensions', () => {
    let DependencyGraph;
    let processDgraph;

    beforeEach(function() {
      Object.defineProperty(process, 'platform', {
        configurable: true,
        enumerable: true,
        value: 'linux',
      });

      DependencyGraph = require('../../node-haste/DependencyGraph');
      processDgraph = processDgraphFor.bind(null, DependencyGraph);
    });

    it('supports custom file extensions', async () => {
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.jsx': [
            '/**',
            ' * @providesModule index',
            ' */',
            'require("a")',
          ].join('\n'),
          'a.coffee': ['/**', ' * @providesModule a', ' */'].join('\n'),
          'X.js': '',
        },
      });

      const opts = {
        ...defaults,
        watchFolders: [root],
        sourceExts: ['jsx', 'coffee'],
      };
      await processDgraph(opts, async dgraph => {
        const entryPath = '/root/index.jsx';
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toMatchSnapshot();
      });
    });

    it('supports custom file extensions with relative paths', async () => {
      const root = '/root';
      setMockFileSystem({
        root: {
          'index.jsx': ['require("./a")'].join('\n'),
          'a.coffee': [].join('\n'),
          'X.js': '',
        },
      });

      const opts = {
        ...defaults,
        watchFolders: [root],
        sourceExts: ['jsx', 'coffee'],
      };
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.jsx',
        );
        expect(deps).toMatchSnapshot();
      });
    });

    it('does not include extensions that are not specified explicitely', async () => {
      const root = '/root';
      setMockFileSystem({
        root: {
          'index.jsx': ['require("./a")'].join('\n'),
          'a.coffee': [].join('\n'),
          'X.js': '',
        },
      });

      const opts = {...defaults, watchFolders: [root]};
      await processDgraph(opts, async dgraph => {
        try {
          await getOrderedDependenciesAsJSON(dgraph, '/root/index.jsx');
          throw Error('should be unreachable');
        } catch (error) {
          if (!(error instanceof UnableToResolveError)) {
            throw error;
          }
          expect(error.originModulePath).toBe('/root/index.jsx');
          expect(error.targetModuleName).toBe('./a');
        }
      });
    });
  });

  describe('Deterministic order of dependencies', () => {
    let callDeferreds, dependencyGraph, moduleReadDeferreds;
    let originalTransformFile;
    let DependencyGraph;

    beforeEach(() => {
      originalTransformFile = transformFile;
      DependencyGraph = require('../../node-haste/DependencyGraph');
      setMockFileSystem({
        root: {
          'index.js': `
            require('./a');
            require('./b');
          `,
          'a.js': `
            require('./c');
            require('./d');
          `,
          'b.js': `
            require('./c');
            require('./d');
          `,
          'c.js': 'require("./e");',
          'd.js': '',
          'e.js': 'require("./f");',
          'f.js': 'require("./c");', // circular dependency
        },
      });
      dependencyGraph = DependencyGraph.load(
        {
          ...defaults,
          watchFolders: ['/root'],
        },
        false /* since we're mocking the filesystem, we cannot use watchman */,
      );
      moduleReadDeferreds = {};
      callDeferreds = [defer(), defer()]; // [a.js, b.js]

      transformFile = jest.fn().mockImplementation((path, ...args) => {
        const returnValue = originalTransformFile(path, ...args);
        if (/\/[ab]\.js$/.test(path)) {
          let deferred = moduleReadDeferreds[path];
          if (!deferred) {
            deferred = moduleReadDeferreds[path] = defer(returnValue);
            const index = Number(path.endsWith('b.js')); // 0 or 1
            callDeferreds[index].resolve();
          }
          return deferred.promise;
        }

        return returnValue;
      });
    });

    afterEach(() => {
      dependencyGraph.then(dgraph => dgraph.end());
      transformFile = originalTransformFile;
    });

    it('produces a deterministic tree if the "a" module resolves first', () => {
      const dependenciesPromise = getOrderedDependenciesAsJSON(
        dependencyGraph,
        '/root/index.js',
      );

      return Promise.all(callDeferreds.map(deferred => deferred.promise))
        .then(() => {
          const main = moduleReadDeferreds['/root/a.js'];
          main.promise.then(() => {
            moduleReadDeferreds['/root/b.js'].resolve();
          });
          main.resolve();
          return dependenciesPromise;
        })
        .then(result => {
          const names = result.map(({path: resultPath}) =>
            resultPath.split('/').pop(),
          );
          expect(names).toEqual([
            'index.js',
            'a.js',
            'c.js',
            'e.js',
            'f.js',
            'd.js',
            'b.js',
          ]);
        });
    });

    it('produces a deterministic tree if the "b" module resolves first', () => {
      const dependenciesPromise = getOrderedDependenciesAsJSON(
        dependencyGraph,
        '/root/index.js',
      );

      return Promise.all(callDeferreds.map(deferred => deferred.promise))
        .then(() => {
          const main = moduleReadDeferreds['/root/b.js'];
          main.promise.then(() => {
            moduleReadDeferreds['/root/a.js'].resolve();
          });
          main.resolve();
          return dependenciesPromise;
        })
        .then(result => {
          const names = result.map(({path: resultPath}) =>
            resultPath.split('/').pop(),
          );
          expect(names).toEqual([
            'index.js',
            'a.js',
            'c.js',
            'e.js',
            'f.js',
            'd.js',
            'b.js',
          ]);
        });
    });
  });

  /**
   * When running a test on the dependency graph, watch mode is enabled by
   * default, so we must end the watcher to ensure the test does not hang up
   * (regardless if the test passes or fails).
   */
  const processDgraphFor = async function(DependencyGraph, options, processor) {
    const dgraph = await DependencyGraph.load(
      options,
      false /* since we're mocking the filesystem, we cannot use watchman */,
    );
    try {
      await processor(dgraph);
    } finally {
      dgraph.end();
    }
  };

  function defer(value) {
    let resolve;
    const promise = new Promise(r => {
      resolve = r;
    });
    return {promise, resolve: () => resolve(value)};
  }

  function setMockFileSystem(object) {
    const fs = require('fs');
    const root = process.platform === 'win32' ? 'C:\\' : '/';
    mockDir(fs, root, {...object, tmp: {}});
  }

  function mockDir(fs, dirPath, desc) {
    for (const entName in desc) {
      const ent = desc[entName];
      const entPath = require('path').join(dirPath, entName);
      if (typeof ent === 'string') {
        fs.writeFileSync(entPath, ent);
        continue;
      }
      if (typeof ent !== 'object') {
        throw new Error(require('util').format('invalid entity:', ent));
      }
      fs.mkdirSync(entPath);
      mockDir(fs, entPath, ent);
    }
  }

  function triggerAndProcessWatchEvent(dgraphPromise, fsOperation) {
    return Promise.resolve(dgraphPromise).then(
      dgraph =>
        new Promise(resolve => {
          // FIXME: Timeout is needed to wait for thing to settle down a bit.
          // This adds flakiness to this test, and normally should not be
          // needed.
          dgraph.once('change', () => setTimeout(resolve, 100));
          fsOperation();
        }),
    );
  }
});
