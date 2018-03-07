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

jest.useRealTimers();
jest
  .mock('fs')
  .mock('graceful-fs')
  .mock('metro-core')
  .mock('../../lib/TransformCaching')
  // It's noticeably faster to prevent running watchman from FileWatcher.
  .mock('child_process', () => ({}))
  .mock('os', () => ({
    ...require.requireActual('os'),
    platform: () => 'test',
  }));

// Super-simple mock for extracting dependencies
const extractDependencies = function(sourceCode: string) {
  const regexp = /require\s*\(\s*(['"])(.*?)\1\s*\)/g;
  const deps = [];
  let match;

  while ((match = regexp.exec(sourceCode))) {
    deps.push(match[2]);
  }

  return deps;
};

jest.mock('graceful-fs', () => require('fs'));

jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

beforeEach(() => {
  jest.resetModules();
  jest.mock('path', () => require.requireActual('path'));
});

describe('traverseDependencies', function() {
  let Module;
  let traverseDependencies;
  let defaults;
  let emptyTransformOptions;
  let UnableToResolveError;

  async function getOrderedDependenciesAsJSON(
    dgraphPromise,
    entryPath,
    platform,
    recursive = true,
  ) {
    const dgraph = await dgraphPromise;

    const edges = new Map();
    const {added} = await traverseDependencies.initialTraverseDependencies(
      entryPath,
      dgraph,
      {...emptyTransformOptions, platform},
      edges,
    );

    const dependencies = recursive
      ? [...added.values()].map(edge => edge.path)
      : edges.get(entryPath).dependencies.values();

    return await Promise.all(
      [...dependencies].map(async path => {
        const dep = dgraph.getModuleForPath(path);
        const moduleDependencies = (await dep.read()).dependencies;

        return {
          path: dep.path,
          isAsset: dep.isAsset(),
          isPolyfill: dep.isPolyfill(),
          resolution: dep.resolution,
          id: dep.getName(),
          dependencies: moduleDependencies,
        };
      }),
    );
  }

  beforeEach(function() {
    jest.resetModules();

    Module = require('../../node-haste/Module');
    traverseDependencies = require('../traverseDependencies');
    ({
      UnableToResolveError,
    } = require('../../node-haste/DependencyGraph/ModuleResolution'));

    emptyTransformOptions = {transformer: {transform: {}}};
    defaults = {
      assetExts: ['png', 'jpg'],
      // This pattern is not expected to match anything.
      blacklistRE: /.^/,
      providesModuleNodeModules: ['haste-fbjs', 'react-haste', 'react-native'],
      platforms: new Set(['ios', 'android']),
      maxWorkers: 1,
      resetCache: true,
      transformCache: require('TransformCaching').mocked(),
      transformCode: (module, sourceCode, transformOptions) => {
        return new Promise(resolve => {
          const deps = {dependencies: []};
          if (!module.path.endsWith('.json')) {
            deps.dependencies = extractDependencies(sourceCode);
          }
          resolve({...deps, code: sourceCode});
        });
      },
      getTransformCacheKey: () => 'abcdef',
      reporter: require('../../lib/reporting').nullReporter,
      sourceExts: ['js', 'json'],
      watch: true,
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['a'],
            isAsset: false,
            isPolyfill: false,

            resolveDependency: undefined,
          },
          {
            id: 'a',
            path: '/root/a.js',
            dependencies: ['b'],
            isAsset: false,
            isPolyfill: false,

            resolveDependency: undefined,
          },
          {
            id: 'b',
            path: '/root/b.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,

            resolveDependency: undefined,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
          null,
          false,
        );
        expect(deps).toEqual([
          {
            id: 'a',
            path: '/root/a.js',
            dependencies: ['b'],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['a'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'a',
            path: '/root/a.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['./a.json', './b'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'package/a.json',
            path: '/root/a.json',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'package/b.json',
            path: '/root/b.json',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['./package.json'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'package/package.json',
            path: '/root/package.json',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['./imgs/a.png'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'imgs/a.png',
            path: '/root/imgs/a.png',
            dependencies: [],
            isAsset: true,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['./imgs/a.png', './imgs/b.png', './imgs/c.png'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'imgs/a@1.5x.png',
            path: '/root/imgs/a@1.5x.png',
            dependencies: [],
            isAsset: true,
            isPolyfill: false,
          },
          {
            id: 'imgs/b@.7x.png',
            path: '/root/imgs/b@.7x.png',
            dependencies: [],
            isAsset: true,
            isPolyfill: false,
          },
          {
            id: 'imgs/c.png',
            path: '/root/imgs/c.png',
            dependencies: [],
            isAsset: true,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
          'ios',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['./imgs/a.png', './imgs/b.png', './imgs/c.png'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'imgs/a@1.5x.ios.png',
            path: '/root/imgs/a@1.5x.ios.png',
            dependencies: [],
            isAsset: true,
            isPolyfill: false,
          },
          {
            id: 'imgs/b@.7x.ios.png',
            path: '/root/imgs/b@.7x.ios.png',
            dependencies: [],
            isAsset: true,
            isPolyfill: false,
          },
          {
            id: 'imgs/c.ios.png',
            path: '/root/imgs/c.ios.png',
            dependencies: [],
            isAsset: true,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['a'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'a',
            path: '/root/a.js',
            dependencies: ['index'],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['aPackage'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'aPackage/main.js',
            path: '/root/aPackage/main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['aPackage/'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'aPackage/main.js',
            path: '/root/aPackage/main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['sha.js', 'x.y.z'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'sha.js/main.js',
            path: '/root/sha.js/main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'x.y.z/main.js',
            path: '/root/x.y.z/main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index.js',
            path: '/root/index.js',
            dependencies: ['aPackage'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'aPackage/index.js',
            path: '/root/aPackage/index.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index.js',
            path: '/root/index.js',
            dependencies: ['aPackage'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'EpicModule',
            path: '/root/aPackage/index.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index.js',
            path: '/root/index.js',
            dependencies: ['aPackage'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'aPackage/lib/index.js',
            path: '/root/aPackage/lib/index.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'test/index.js',
            path: '/root/index.js',
            dependencies: ['./lib/'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'test/lib/index.js',
            path: '/root/lib/index.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'test/index.js',
            path: '/root/index.js',
            dependencies: ['./lib/'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: '/root/lib/main.js',
            path: '/root/lib/main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
      });
    });

    it('should fatal on multiple modules with the same name (actually broken)', async () => {
      const root = '/root';
      console.warn = jest.fn();
      setMockFileSystem({
        root: {
          'index.js': ['/**', ' * @providesModule index', ' */'].join('\n'),
          'b.js': ['/**', ' * @providesModule index', ' */'].join('\n'),
        },
      });

      const opts = {...defaults, projectRoots: [root]};

      // FIXME: This is broken, jest-haste-map does not fatal on modules with
      // the same name, because not fataling was required for supporting some
      // OSS projects. We'd like to enable it someday.

      //try {
      await processDgraph(opts, async dgraph => {});
      //   throw new Error('should be unreachable');
      // } catch (error) {
      //   expect(error.message).toEqual(
      //     `Failed to build DependencyGraph: @providesModule naming collision:\n` +
      //       `  Duplicate module name: index\n` +
      //       `  Paths: /root/b.js collides with /root/index.js\n\n` +
      //       'This error is caused by a @providesModule declaration ' +
      //       'with the same name across two different files.',
      //   );
      //   expect(error.type).toEqual('DependencyGraphError');
      //   expect(console.warn).toBeCalled();
      // }
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

      const opts = {...defaults, projectRoots: [root]};
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['aPackage/subdir/lolynot'],
            isAsset: false,
            isPolyfill: false,

            resolveDependency: undefined,
          },
          {
            id: 'aPackage/subdir/lolynot.js',
            path: '/root/aPackage/subdir/lolynot.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,

            resolveDependency: undefined,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['aPackage'],
            isAsset: false,
            isPolyfill: false,

            resolveDependency: undefined,
          },
          {
            id: 'aPackage/main.js',
            path: '/root/aPackage/main.js',
            dependencies: ['./subdir/lolynot'],
            isAsset: false,
            isPolyfill: false,

            resolveDependency: undefined,
          },
          {
            id: 'aPackage/subdir/lolynot.js',
            path: '/root/aPackage/subdir/lolynot.js',
            dependencies: ['../other'],
            isAsset: false,
            isPolyfill: false,

            resolveDependency: undefined,
          },
          {
            id: 'aPackage/other.js',
            path: '/root/aPackage/other.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,

            resolveDependency: undefined,
          },
        ]);
      });
    });

    testBrowserField('browser');
    testBrowserField('react-native');

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

          const opts = {...defaults, projectRoots: [root]};
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/index.js',
            );
            expect(deps).toEqual([
              {
                id: 'index',
                path: '/root/index.js',
                dependencies: ['aPackage'],
                isAsset: false,
                isPolyfill: false,

                resolveDependency: undefined,
              },
              {
                id: 'aPackage/client.js',
                path: '/root/aPackage/client.js',
                dependencies: [],
                isAsset: false,
                isPolyfill: false,

                resolveDependency: undefined,
              },
            ]);
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

          const opts = {...defaults, projectRoots: [root]};
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/index.js',
            );
            expect(deps).toEqual([
              {
                id: 'index',
                path: '/root/index.js',
                dependencies: ['aPackage'],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'aPackage/client.js',
                path: '/root/aPackage/client.js',
                dependencies: [],
                isAsset: false,
                isPolyfill: false,
              },
            ]);
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
            projectRoots: [root],
          };
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/index.js',
            );
            expect(deps).toEqual([
              {
                id: 'index',
                path: '/root/index.js',
                dependencies: ['aPackage'],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'aPackage/client.js',
                path: '/root/aPackage/client.js',
                dependencies: [],
                isAsset: false,
                isPolyfill: false,

                resolveDependency: undefined,
              },
            ]);
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
          projectRoots: [root],
        };
        await processDgraph(opts, async dgraph => {
          const deps = await getOrderedDependenciesAsJSON(
            dgraph,
            '/root/index.js',
          );
          expect(deps).toEqual([
            {
              id: 'index',
              path: '/root/index.js',
              dependencies: ['aPackage'],
              isAsset: false,
              isPolyfill: false,
            },
            {
              id: 'aPackage/client.js',
              path: '/root/aPackage/client.js',
              dependencies: [],
              isAsset: false,
              isPolyfill: false,

              resolveDependency: undefined,
            },
          ]);
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
            projectRoots: [root],
          };
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/index.js',
            );
            expect(deps).toEqual([
              {
                id: 'index',
                path: '/root/index.js',
                dependencies: ['aPackage'],
                isAsset: false,
                isPolyfill: false,

                resolveDependency: undefined,
              },
              {
                id: 'aPackage/client.js',
                path: '/root/aPackage/client.js',
                dependencies: [],
                isAsset: false,
                isPolyfill: false,

                resolveDependency: undefined,
              },
            ]);
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

          const opts = {...defaults, projectRoots: [root]};
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/index.js',
            );
            expect(deps).toEqual([
              {
                id: 'index',
                path: '/root/index.js',
                dependencies: ['aPackage'],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'aPackage/client.js',
                path: '/root/aPackage/client.js',
                dependencies: ['./node', './dir/server.js'],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'aPackage/not-node.js',
                path: '/root/aPackage/not-node.js',
                dependencies: ['./not-browser'],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'aPackage/browser.js',
                path: '/root/aPackage/browser.js',
                dependencies: [],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'aPackage/dir/client.js',
                path: '/root/aPackage/dir/client.js',
                dependencies: ['../hello'],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'aPackage/bye.js',
                path: '/root/aPackage/bye.js',
                dependencies: [],
                isAsset: false,
                isPolyfill: false,
              },
            ]);
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

          const opts = {...defaults, projectRoots: [root]};
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/index.js',
            );
            expect(deps).toEqual([
              {
                id: 'index',
                path: '/root/index.js',
                dependencies: ['aPackage'],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'aPackage/index.js',
                path: '/root/aPackage/index.js',
                dependencies: ['node-package'],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'browser-package/index.js',
                path: '/root/aPackage/browser-package/index.js',
                dependencies: [],
                isAsset: false,
                isPolyfill: false,
              },
            ]);
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

          const opts = {...defaults, projectRoots: [root]};
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/index.js',
            );
            expect(deps).toEqual([
              {
                id: 'index',
                path: '/root/index.js',
                dependencies: ['aPackage'],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'aPackage/index.js',
                path: '/root/aPackage/index.js',
                dependencies: ['./dir/ooga'],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'aPackage/dir/ooga.js',
                path: '/root/aPackage/dir/ooga.js',
                dependencies: ['node-package'],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'aPackage/dir/browser.js',
                path: '/root/aPackage/dir/browser.js',
                dependencies: [],
                isAsset: false,
                isPolyfill: false,
              },
            ]);
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

          const opts = {...defaults, projectRoots: [root]};
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/index.js',
            );
            expect(deps).toEqual([
              {
                id: 'index',
                path: '/root/index.js',
                dependencies: ['aPackage'],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'aPackage/index.js',
                path: '/root/aPackage/index.js',
                dependencies: ['node-package'],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'browser-package/index.js',
                path: '/root/aPackage/browser-package/index.js',
                dependencies: [],
                isAsset: false,
                isPolyfill: false,
              },
            ]);
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

          const opts = {...defaults, projectRoots: [root]};
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/index.js',
            );
            expect(deps).toEqual([
              {
                id: 'index',
                path: '/root/index.js',
                dependencies: ['aPackage'],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'aPackage/index.js',
                path: '/root/aPackage/index.js',
                dependencies: ['booga'],
                isAsset: false,
                isPolyfill: false,
              },
              {
                dependencies: [],
                id: 'emptyModule.js',
                isAsset: false,
                isPolyfill: false,
                path: '/root/emptyModule.js',
              },
            ]);
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

          const opts = {...defaults, projectRoots: [root]};
          await processDgraph(opts, async dgraph => {
            const deps = await getOrderedDependenciesAsJSON(
              dgraph,
              '/root/index.js',
            );
            expect(deps).toEqual([
              {
                id: 'index',
                path: '/root/index.js',
                dependencies: ['aPackage'],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'aPackage/index.js',
                path: '/root/aPackage/index.js',
                dependencies: ['./booga'],
                isAsset: false,
                isPolyfill: false,
              },
              {
                dependencies: [],
                id: 'emptyModule.js',
                isAsset: false,
                isPolyfill: false,
                path: '/root/emptyModule.js',
              },
            ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['aPackage'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'aPackage/index.js',
            path: '/root/aPackage/index.js',
            dependencies: ['node-package'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'rn-package/index.js',
            path: '/root/aPackage/node_modules/rn-package/index.js',
            dependencies: ['nested-package'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'nested-browser-package/index.js',
            path: '/root/aPackage/node_modules/nested-browser-package/index.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index.js',
            path: '/root/index.js',
            dependencies: ['/root/apple.js'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'apple.js',
            path: '/root/apple.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['aPackage'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'aPackage/index.js',
            path: '/root/aPackage/index.js',
            dependencies: [
              'node-package-a',
              'node-package-b',
              'node-package-c',
            ],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'rn-package-a/index.js',
            path: '/root/aPackage/node_modules/rn-package-a/index.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'rn-package-b/index.js',
            path: '/root/aPackage/node_modules/rn-package-b/index.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'rn-package-d/index.js',
            path: '/root/aPackage/node_modules/rn-package-d/index.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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
        projectRoots: [root],
        extraNodeModules: {
          bar: root + '/provides-bar',
        },
      };
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index.js',
            path: '/root/index.js',
            dependencies: ['./foo'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'foo/index.js',
            path: '/root/foo/index.js',
            dependencies: ['bar'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: '/root/provides-bar/lib/bar.js',
            path: '/root/provides-bar/lib/bar.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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
        projectRoots: [root],
        extraNodeModules: {
          bar: root + '/provides-bar',
        },
      };
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index.js',
            path: '/root/index.js',
            dependencies: ['bar'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'node_modules/bar.js',
            path: '/root/node_modules/bar.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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
        projectRoots: [root],
        extraNodeModules: {
          bar: root + '/provides-bar',
        },
      };
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index.js',
            path: '/root/index.js',
            dependencies: ['bar/lib/foo'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: '/root/provides-bar/lib/foo.js',
            path: '/root/provides-bar/lib/foo.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: 'C:\\root\\index.js',
            dependencies: ['a'],
            isAsset: false,
            isPolyfill: false,

            resolveDependency: undefined,
          },
          {
            id: 'a',
            path: 'C:\\root\\a.js',
            dependencies: ['b'],
            isAsset: false,
            isPolyfill: false,

            resolveDependency: undefined,
          },
          {
            id: 'b',
            path: 'C:\\root\\b.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,

            resolveDependency: undefined,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index.js',
            path: 'C:\\root\\index.js',
            dependencies: ['C:/root/apple.js'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'apple.js',
            path: 'C:\\root\\apple.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: 'C:\\root\\index.js',
            dependencies: ['./imgs/a.png', './imgs/b.png', './imgs/c.png'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'imgs\\a@1.5x.png',
            path: 'C:\\root\\imgs\\a@1.5x.png',
            dependencies: [],
            isAsset: true,
            isPolyfill: false,
          },
          {
            id: 'imgs\\b@.7x.png',
            path: 'C:\\root\\imgs\\b@.7x.png',
            dependencies: [],
            isAsset: true,
            isPolyfill: false,
          },
          {
            id: 'imgs\\c.png',
            path: 'C:\\root\\imgs\\c.png',
            dependencies: [],
            isAsset: true,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['foo', 'bar'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'foo/main.js',
            path: '/root/node_modules/foo/main.js',
            dependencies: ['bar'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar/main.js',
            path: '/root/node_modules/foo/node_modules/bar/main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar/main.js',
            path: '/root/node_modules/bar/main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.ios.js',
          'ios',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.ios.js',
            dependencies: ['foo', 'bar'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'foo/index.ios.js',
            path: '/root/node_modules/foo/index.ios.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar/main.ios.js',
            path: '/root/node_modules/bar/main.ios.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['foo', 'bar/'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'foo/main.js',
            path: '/root/node_modules/foo/main.js',
            dependencies: ['bar/lol'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar/lol.js',
            path: '/root/node_modules/foo/node_modules/bar/lol.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar/main.js',
            path: '/root/node_modules/bar/main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['foo', 'bar'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'foo/main.js',
            path: '/root/node_modules/foo/main.js',
            dependencies: ['bar/lol'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar/lol.js',
            path: '/root/node_modules/foo/node_modules/bar/lol.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar/main2.js',
            path: '/root/node_modules/bar/main2.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['bar'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar',
            path: '/root/path/to/bar.js',
            dependencies: ['foo'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'foo/main.js',
            path: '/root/node_modules/foo/main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root, otherRoot]};
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
        filesystem.root['index.js'] = filesystem.root['index.js']
          .replace('require("dontWork")', '')
          .replace('require("wontWork")', '');
        return triggerAndProcessWatchEvent(dgraph, 'change', root + '/index.js')
          .then(() => getOrderedDependenciesAsJSON(dgraph, '/root/index.js'))
          .then(deps => {
            expect(deps).toEqual([
              {
                id: 'index',
                path: '/root/index.js',
                dependencies: [
                  'shouldWork',
                  'ember',
                  'internalVendoredPackage',
                  'anotherIndex',
                ],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'shouldWork',
                path: '/root/node_modules/react-haste/main.js',
                dependencies: ['submodule'],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'submodule/main.js',
                path:
                  '/root/node_modules/react-haste/node_modules/submodule/main.js',
                dependencies: [],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'ember/main.js',
                path: '/root/node_modules/ember/main.js',
                dependencies: [],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'internalVendoredPackage',
                path: '/root/vendored_modules/a-vendored-package/main.js',
                dependencies: [],
                isAsset: false,
                isPolyfill: false,
              },
              {
                id: 'anotherIndex',
                path: '/anotherRoot/index.js',
                dependencies: [],
                isAsset: false,
                isPolyfill: false,
              },
            ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/react-haste/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/react-haste/index.js',
            dependencies: ['shouldWork'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'shouldWork',
            path: '/react-haste/node_modules/react-haste/main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['sha.js'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'sha.js/main.js',
            path: '/root/node_modules/sha.js/main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.ios.js',
          'ios',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.ios.js',
            dependencies: ['a'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'a',
            path: '/root/a.ios.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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
        projectRoots: [root],
      };
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.ios.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.ios.js',
            dependencies: ['a'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'a',
            path: '/root/a.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.ios.js',
          'ios',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.ios.js',
            dependencies: ['./a'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'a.ios.js',
            path: '/root/a.ios.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['foo/package.json', 'bar'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'foo/package.json',
            path: '/root/node_modules/foo/package.json',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar/main.js',
            path: '/root/node_modules/bar/main.js',
            dependencies: ['./package.json'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar/package.json',
            path: '/root/node_modules/bar/package.json',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index.js',
            path: '/root/index.js',
            dependencies: ['a/index.js'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'a/index.js',
            path: '/root/node_modules/a/index.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: 'C:\\root\\index.js',
            dependencies: ['foo', 'bar'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'foo/main.js',
            path: 'C:\\root\\node_modules\\foo\\main.js',
            dependencies: ['bar'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar/main.js',
            path: 'C:\\root\\node_modules\\foo\\node_modules\\bar\\main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar/main.js',
            path: 'C:\\root\\node_modules\\bar\\main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.ios.js',
          'ios',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: 'C:\\root\\index.ios.js',
            dependencies: ['foo', 'bar'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'foo/index.ios.js',
            path: 'C:\\root\\node_modules\\foo\\index.ios.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar/main.ios.js',
            path: 'C:\\root\\node_modules\\bar\\main.ios.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: 'C:\\root\\index.js',
            dependencies: ['foo', 'bar/'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'foo/main.js',
            path: 'C:\\root\\node_modules\\foo\\main.js',
            dependencies: ['bar/lol'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar/lol.js',
            path: 'C:\\root\\node_modules\\foo\\node_modules\\bar\\lol.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar/main.js',
            path: 'C:\\root\\node_modules\\bar\\main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: 'C:\\root\\index.js',
            dependencies: ['foo', 'bar'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'foo/main.js',
            path: 'C:\\root\\node_modules\\foo\\main.js',
            dependencies: ['bar/lol'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar/lol.js',
            path: 'C:\\root\\node_modules\\foo\\node_modules\\bar\\lol.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar/main2.js',
            path: 'C:\\root\\node_modules\\bar\\main2.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: 'C:\\root\\index.js',
            dependencies: ['bar'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar',
            path: 'C:\\root\\path\\to\\bar.js',
            dependencies: ['foo'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'foo/main.js',
            path: 'C:\\root\\node_modules\\foo\\main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root, otherRoot]};
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
        filesystem.root['index.js'] = filesystem.root['index.js']
          .replace('require("dontWork")', '')
          .replace('require("wontWork")', '');
        await triggerAndProcessWatchEvent(dgraph, 'change', entryPath);
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toEqual([
          {
            id: 'index',
            path: 'C:\\root\\index.js',
            dependencies: [
              'shouldWork',
              'ember',
              'internalVendoredPackage',
              'anotherIndex',
            ],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'shouldWork',
            path: 'C:\\root\\node_modules\\react-haste\\main.js',
            dependencies: ['submodule'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'submodule/main.js',
            path:
              'C:\\root\\node_modules\\react-haste\\node_modules\\submodule\\main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'ember/main.js',
            path: 'C:\\root\\node_modules\\ember\\main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'internalVendoredPackage',
            path: 'C:\\root\\vendored_modules\\a-vendored-package\\main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'anotherIndex',
            path: 'C:\\anotherRoot\\index.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\react-haste\\index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: 'C:\\react-haste\\index.js',
            dependencies: ['shouldWork'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'shouldWork',
            path: 'C:\\react-haste\\node_modules\\react-haste\\main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: 'C:\\root\\index.js',
            dependencies: ['sha.js'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'sha.js/main.js',
            path: 'C:\\root\\node_modules\\sha.js\\main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.ios.js',
          'ios',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: 'C:\\root\\index.ios.js',
            dependencies: ['a'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'a',
            path: 'C:\\root\\a.ios.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.ios.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: 'C:\\root\\index.ios.js',
            dependencies: ['a'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'a',
            path: 'C:\\root\\a.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.ios.js',
          'ios',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: 'C:\\root\\index.ios.js',
            dependencies: ['./a'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'a.ios.js',
            path: 'C:\\root\\a.ios.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          'C:\\root\\index.js',
        );
        expect(deps).toEqual([
          {
            id: 'index',
            path: 'C:\\root\\index.js',
            dependencies: ['foo/package.json', 'bar'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'foo/package.json',
            path: 'C:\\root\\node_modules\\foo\\package.json',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar/main.js',
            path: 'C:\\root\\node_modules\\bar\\main.js',
            dependencies: ['./package.json'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar/package.json',
            path: 'C:\\root\\node_modules\\bar\\package.json',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
      });
    });
  });

  describe('file watch updating', function() {
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

    it('updates module dependencies', async () => {
      var root = '/root';
      var filesystem = setMockFileSystem({
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

      const opts = {...defaults, projectRoots: [root]};
      const entryPath = '/root/index.js';
      await processDgraph(opts, async dgraph => {
        await getOrderedDependenciesAsJSON(dgraph, entryPath);
        filesystem.root['index.js'] = filesystem.root['index.js'].replace(
          'require("foo")',
          '',
        );
        await triggerAndProcessWatchEvent(dgraph, 'change', entryPath);
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['aPackage'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'aPackage/main.js',
            path: '/root/aPackage/main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
      });
    });

    it('updates module dependencies on file change', async () => {
      var root = '/root';
      var filesystem = setMockFileSystem({
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

      const opts = {...defaults, projectRoots: [root]};
      const entryPath = '/root/index.js';
      await processDgraph(opts, async dgraph => {
        await getOrderedDependenciesAsJSON(dgraph, entryPath);
        filesystem.root['index.js'] = filesystem.root['index.js'].replace(
          'require("foo")',
          '',
        );
        await triggerAndProcessWatchEvent(dgraph, 'change', root + '/index.js');
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['aPackage'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'aPackage/main.js',
            path: '/root/aPackage/main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
          },
        ]);
      });
    });

    it('updates module dependencies on file delete', async () => {
      var root = '/root';
      var filesystem = setMockFileSystem({
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

      const opts = {...defaults, projectRoots: [root]};
      const entryPath = '/root/index.js';
      await processDgraph(opts, async dgraph => {
        await getOrderedDependenciesAsJSON(dgraph, entryPath);
        delete filesystem.root['foo.js'];
        await triggerAndProcessWatchEvent(dgraph, 'change', root + '/foo.js');
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
      var filesystem = setMockFileSystem({
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

      const opts = {...defaults, projectRoots: [root]};
      const entryPath = '/root/index.js';
      await processDgraph(opts, async dgraph => {
        await getOrderedDependenciesAsJSON(dgraph, entryPath);
        filesystem.root['bar.js'] = [
          '/**',
          ' * @providesModule bar',
          ' */',
          'require("foo")',
        ].join('\n');
        await triggerAndProcessWatchEvent(dgraph, 'change', root + '/bar.js');
        filesystem.root.aPackage['main.js'] = 'require("bar")';
        await triggerAndProcessWatchEvent(
          dgraph,
          'change',
          root + '/aPackage/main.js',
        );
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['aPackage', 'foo'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'aPackage/main.js',
            path: '/root/aPackage/main.js',
            dependencies: ['bar'],
            isAsset: false,
            isPolyfill: false,
          },
          {
            id: 'bar',
            path: '/root/bar.js',
            dependencies: ['foo'],
            isAsset: false,
            isPolyfill: false,
            resolveDependency: undefined,
          },
          {
            id: 'foo',
            path: '/root/foo.js',
            dependencies: ['aPackage'],
            isAsset: false,
            isPolyfill: false,
            resolveDependency: undefined,
          },
        ]);
      });
    });

    it('updates module dependencies on relative asset add', async () => {
      var root = '/root';
      var filesystem = setMockFileSystem({
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

      const opts = {...defaults, assetExts: ['png'], projectRoots: [root]};
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
        filesystem.root['foo.png'] = '';
        await triggerAndProcessWatchEvent(dgraph, 'change', root + '/foo.png');
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['./foo.png'],
            isAsset: false,
            isPolyfill: false,
            resolveDependency: undefined,
          },
          {
            id: 'foo.png',
            path: '/root/foo.png',
            dependencies: [],
            isAsset: true,
            isPolyfill: false,
            resolveDependency: undefined,
          },
        ]);
      });
    });

    it('changes to browser field', async () => {
      expect.assertions(1);
      var root = '/root';
      var filesystem = setMockFileSystem({
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

      const opts = {...defaults, projectRoots: [root]};
      const entryPath = '/root/index.js';
      await processDgraph(opts, async dgraph => {
        await getOrderedDependenciesAsJSON(dgraph, entryPath);
        filesystem.root.aPackage['package.json'] = JSON.stringify({
          name: 'aPackage',
          main: 'main.js',
          browser: 'browser.js',
        });
        await triggerAndProcessWatchEvent(
          dgraph,
          'change',
          root + '/aPackage/package.json',
        );
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['aPackage'],
            isAsset: false,
            isPolyfill: false,
            resolveDependency: undefined,
          },
          {
            id: 'aPackage/browser.js',
            path: '/root/aPackage/browser.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
            resolveDependency: undefined,
          },
        ]);
      });
    });

    it('removes old package from cache', async () => {
      var root = '/root';
      var filesystem = setMockFileSystem({
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

      const opts = {...defaults, projectRoots: [root]};
      const entryPath = '/root/index.js';
      await processDgraph(opts, async dgraph => {
        await getOrderedDependenciesAsJSON(dgraph, entryPath);
        filesystem.root['index.js'] = [
          '/**',
          ' * @providesModule index',
          ' */',
          'require("bPackage")',
        ].join('\n');
        filesystem.root.aPackage['package.json'] = JSON.stringify({
          name: 'bPackage',
          main: 'main.js',
        });
        await new Promise(resolve => {
          dgraph.once('change', () => resolve());
          triggerWatchEvent('change', root + '/index.js');
          triggerWatchEvent('change', root + '/aPackage/package.json');
        });
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toEqual([
          {
            dependencies: ['bPackage'],
            id: 'index',
            isAsset: false,
            isPolyfill: false,
            path: '/root/index.js',
            resolveDependency: undefined,
          },
          {
            dependencies: [],
            id: 'bPackage/main.js',
            isAsset: false,
            isPolyfill: false,
            path: '/root/aPackage/main.js',
          },
        ]);
      });
    });

    it('should update node package changes', async () => {
      expect.assertions(2);
      var root = '/root';
      var filesystem = setMockFileSystem({
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

      const opts = {...defaults, projectRoots: [root]};
      const entryPath = '/root/index.js';
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['foo'],
            isAsset: false,
            isPolyfill: false,
            resolveDependency: undefined,
          },
          {
            id: 'foo/main.js',
            path: '/root/node_modules/foo/main.js',
            dependencies: ['bar'],
            isAsset: false,
            isPolyfill: false,
            resolveDependency: undefined,
          },
          {
            id: 'bar/main.js',
            path: '/root/node_modules/foo/node_modules/bar/main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,
            resolveDependency: undefined,
          },
        ]);

        filesystem.root.node_modules.foo['main.js'] = 'lol';
        await triggerAndProcessWatchEvent(
          dgraph,
          'change',
          root + '/node_modules/foo/main.js',
        );
        const deps2 = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps2).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['foo'],
            isAsset: false,
            isPolyfill: false,
            resolveDependency: undefined,
          },
          {
            id: 'foo/main.js',
            path: '/root/node_modules/foo/main.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,

            resolveDependency: undefined,
          },
        ]);
      });
    });

    it('should update node package main changes', async () => {
      expect.assertions(1);
      var root = '/root';
      var filesystem = setMockFileSystem({
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

      const opts = {...defaults, projectRoots: [root]};
      const entryPath = '/root/index.js';
      await processDgraph(opts, async dgraph => {
        await getOrderedDependenciesAsJSON(dgraph, entryPath);
        filesystem.root.node_modules.foo['package.json'] = JSON.stringify({
          name: 'foo',
          main: 'main.js',
          browser: 'browser.js',
        });
        await triggerAndProcessWatchEvent(
          dgraph,
          'change',
          root + '/node_modules/foo/package.json',
        );
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toEqual([
          {
            id: 'index',
            path: '/root/index.js',
            dependencies: ['foo'],
            isAsset: false,
            isPolyfill: false,
            resolveDependency: undefined,
          },
          {
            id: 'foo/browser.js',
            path: '/root/node_modules/foo/browser.js',
            dependencies: [],
            isAsset: false,
            isPolyfill: false,

            resolveDependency: undefined,
          },
        ]);
      });
    });

    it('should not error when the watcher reports a known file as added', async () => {
      expect.assertions(1);
      var root = '/root';
      setMockFileSystem({
        root: {
          'index.js': [
            '/**',
            ' * @providesModule index',
            ' */',
            'var b = require("b");',
          ].join('\n'),
          'b.js': [
            '/**',
            ' * @providesModule b',
            ' */',
            'module.exports = function() {};',
          ].join('\n'),
        },
      });

      const opts = {...defaults, projectRoots: [root]};
      const entryPath = '/root/index.js';
      await processDgraph(opts, async dgraph => {
        await getOrderedDependenciesAsJSON(dgraph, entryPath);
        await triggerAndProcessWatchEvent(dgraph, 'change', root + '/index.js');
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toBeDefined();
      });
    });

    it('should recover from multiple modules with the same name', async () => {
      const root = '/root';
      console.warn = jest.fn();
      const filesystem = setMockFileSystem({
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

      const opts = {...defaults, projectRoots: [root]};
      const entryPath = '/root/index.js';
      await processDgraph(opts, async dgraph => {
        await getOrderedDependenciesAsJSON(dgraph, entryPath);
        filesystem.root['b.js'] = ['/**', ' * @providesModule a', ' */'].join(
          '\n',
        );
        await triggerAndProcessWatchEvent(dgraph, 'change', root + '/b.js');
        try {
          await getOrderedDependenciesAsJSON(dgraph, root + '/index.js');
          throw new Error('expected `getOrderedDependenciesAsJSON` to fail');
        } catch (error) {
          const {
            AmbiguousModuleResolutionError,
          } = require('../../node-haste/DependencyGraph/ResolutionRequest');
          if (!(error instanceof AmbiguousModuleResolutionError)) {
            throw error;
          }
          expect(console.warn).toBeCalled();
          filesystem.root['b.js'] = ['/**', ' * @providesModule b', ' */'].join(
            '\n',
          );
          await triggerAndProcessWatchEvent(dgraph, 'change', root + '/b.js');
        }
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
        projectRoots: [root],
        sourceExts: ['jsx', 'coffee'],
      };
      await processDgraph(opts, async dgraph => {
        const entryPath = '/root/index.jsx';
        const deps = await getOrderedDependenciesAsJSON(dgraph, entryPath);
        expect(deps).toEqual([
          {
            dependencies: ['a'],
            id: 'index',
            isAsset: false,
            isPolyfill: false,
            path: '/root/index.jsx',
          },
          {
            dependencies: [],
            id: 'a',
            isAsset: false,
            isPolyfill: false,
            path: '/root/a.coffee',
          },
        ]);
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
        projectRoots: [root],
        sourceExts: ['jsx', 'coffee'],
      };
      await processDgraph(opts, async dgraph => {
        const deps = await getOrderedDependenciesAsJSON(
          dgraph,
          '/root/index.jsx',
        );
        expect(deps).toEqual([
          {
            dependencies: ['./a'],
            id: 'index.jsx',
            isAsset: false,
            isPolyfill: false,
            path: '/root/index.jsx',
          },
          {
            dependencies: [],
            id: 'a.coffee',
            isAsset: false,
            isPolyfill: false,
            path: '/root/a.coffee',
          },
        ]);
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

      const opts = {...defaults, projectRoots: [root]};
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

  describe('Progress updates', () => {
    let dependencyGraph, onProgress;

    function makeModule(id, dependencies = []) {
      return (
        `
        /**
         * @providesModule ${id}
         */\n` +
        dependencies.map(d => `require(${JSON.stringify(d)});`).join('\n')
      );
    }

    function getDependencies() {
      return traverseDependencies.initialTraverseDependencies(
        '/root/index.js',
        dependencyGraph,
        emptyTransformOptions,
        new Map(),
        onProgress,
      );
    }

    beforeEach(function() {
      onProgress = jest.genMockFn();
      setMockFileSystem({
        root: {
          'index.js': makeModule('index', ['a', 'b']),
          'a.js': makeModule('a', ['c', 'd']),
          'b.js': makeModule('b', ['d', 'e']),
          'c.js': makeModule('c'),
          'd.js': makeModule('d', ['f']),
          'e.js': makeModule('e', ['f']),
          'f.js': makeModule('f', ['g']),
          'g.js': makeModule('g'),
        },
      });
      const DependencyGraph = require('../../node-haste/DependencyGraph');
      return DependencyGraph.load(
        {
          ...defaults,
          projectRoots: ['/root'],
        },
        false /* since we're mocking the filesystem, we cannot use watchman */,
      ).then(dg => {
        dependencyGraph = dg;
      });
    });

    afterEach(() => {
      dependencyGraph.end();
    });

    it('calls back for each finished module', async () => {
      await getDependencies();

      // We get a progress change twice per dependency
      // (when we discover it and when we process it).
      expect(onProgress.mock.calls.length).toBe(8 * 2);
    });

    it('increases the number of discover/finished modules in steps of one', async () => {
      await getDependencies();

      expect(onProgress.mock.calls).toMatchSnapshot();
    });
  });

  describe('Asset module dependencies', () => {
    let DependencyGraph;
    let processDgraph;

    beforeEach(() => {
      DependencyGraph = require('../../node-haste/DependencyGraph');
      processDgraph = processDgraphFor.bind(null, DependencyGraph);
    });

    it.skip('allows setting dependencies for asset modules (broken)', async () => {
      const assetDependencies = ['/root/apple.png', '/root/banana.png'];

      setMockFileSystem({
        root: {
          'index.js': 'require("./a.png")',
          'a.png': '',
          'apple.png': '',
          'banana.png': '',
        },
      });

      const opts = {...defaults, assetDependencies, projectRoots: ['/root']};
      await processDgraph(opts, async dgraph => {
        const {dependencies} = await dgraph.getDependencies({
          entryPath: '/root/index.js',
        });
        const [, assetModule] = dependencies;
        const deps = await assetModule.getDependencies();
        expect(deps).toBe(assetDependencies);
      });
    });
  });

  describe('Deterministic order of dependencies', () => {
    let callDeferreds, dependencyGraph, moduleReadDeferreds;
    let moduleRead;
    let DependencyGraph;

    beforeEach(() => {
      moduleRead = Module.prototype.read;
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
          projectRoots: ['/root'],
        },
        false /* since we're mocking the filesystem, we cannot use watchman */,
      );
      moduleReadDeferreds = {};
      callDeferreds = [defer(), defer()]; // [a.js, b.js]

      Module.prototype.read = jest.genMockFn().mockImplementation(function() {
        const returnValue = moduleRead.apply(this, arguments);
        if (/\/[ab]\.js$/.test(this.path)) {
          let deferred = moduleReadDeferreds[this.path];
          if (!deferred) {
            deferred = moduleReadDeferreds[this.path] = defer(returnValue);
            const index = Number(this.path.endsWith('b.js')); // 0 or 1
            callDeferreds[index].resolve();
          }
          return deferred.promise;
        }

        return returnValue;
      });
    });

    afterEach(() => {
      dependencyGraph.then(dgraph => dgraph.end());
      Module.prototype.read = moduleRead;
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

  describe('getModuleForPath()', () => {
    let DependencyGraph;
    let dependencyGraph;

    beforeEach(async () => {
      setMockFileSystem({
        root: {
          'index.js': ``,
          imgs: {
            'a.png': '',
          },
        },
      });

      DependencyGraph = require('../../node-haste/DependencyGraph');
      dependencyGraph = await DependencyGraph.load(
        {
          ...defaults,
          projectRoots: ['/root'],
        },
        false /* since we're mocking the filesystem, we cannot use watchman */,
      );
    });

    afterEach(() => {
      dependencyGraph.end();
    });

    it('returns correctly a JS module', async () => {
      const module = dependencyGraph.getModuleForPath('/root/index.js');
      expect(module.getName()).toBe('index.js');
      expect(module.isAsset()).toBe(false);
    });

    it('returns correctly an asset module', async () => {
      const module = dependencyGraph.getModuleForPath('/root/imgs/a.png');
      expect(module.getName()).toBe('imgs/a.png');
      expect(module.isAsset()).toBe(true);
    });
  });

  /**
   * When running a test on the dependency graph, watch mode is enabled by
   * default, so we must end the watcher to ensure the test does not hang up
   * (regardless if the test passes or fails).
   */
  async function processDgraphFor(DependencyGraph, options, processor) {
    const dgraph = await DependencyGraph.load(
      options,
      false /* since we're mocking the filesystem, we cannot use watchman */,
    );
    try {
      await processor(dgraph);
    } finally {
      dgraph.end();
    }
  }

  function defer(value) {
    let resolve;
    const promise = new Promise(r => {
      resolve = r;
    });
    return {promise, resolve: () => resolve(value)};
  }

  function setMockFileSystem(object) {
    return require('fs').__setMockFilesystem(object);
  }

  function triggerAndProcessWatchEvent(dgraphPromise, eventType, filename) {
    return Promise.resolve(dgraphPromise).then(
      dgraph =>
        new Promise(resolve => {
          dgraph.once('change', () => resolve());
          triggerWatchEvent(eventType, filename);
        }),
    );
  }

  function triggerWatchEvent(eventType, filename) {
    return require('fs').__triggerWatchEvent(eventType, filename);
  }
});
