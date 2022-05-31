/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 */

'use strict';

const {mergeConfig} = require('metro-config');
const path = require('path');
const mockPlatform = process.platform;

jest.useRealTimers();
jest
  // It's noticeably faster to prevent running watchman from FileWatcher.
  .mock('child_process', () => ({}))
  .mock('os', () => ({
    platform: () => 'test',
    tmpdir: () => (mockPlatform === 'win32' ? 'C:\\tmp' : '/tmp'),
    hostname: () => 'testhost',
    endianness: () => 'LE',
    release: () => '',
  }))
  .mock('graceful-fs', () => require('fs'));

jest.setTimeout(10000);

let fs;
let resolver;

['linux', 'win32'].forEach(osPlatform => {
  function setMockFileSystem(object) {
    const root = p('/root');

    fs.mkdirSync(root);
    fs.mkdirSync(p('/tmp'));
    mockDir(root, object);
  }

  function mockFileImport(importStatement: string) {
    return `import foo from 'bar';\n${importStatement}\nimport bar from 'foo';`;
  }

  function mockDir(dirPath, desc) {
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
      mockDir(entPath, ent);
    }
  }

  const defaultConfig = {
    resolver: {
      assetExts: ['png', 'jpg'],
      assetResolutions: ['1', '1.5', '2', '3', '4'],
      // This pattern is not expected to match anything.
      blockList: /.^/,
      nodeModulesPaths: [],
      platforms: ['ios', 'android'],
      resolverMainFields: ['react-native', 'browser', 'main'],
      sourceExts: ['js', 'json'],
      useWatchman: false,
    },
    maxWorkers: 1,
    projectRoot: p('/root'),
    reporter: require('../../lib/reporting').nullReporter,
    transformer: {},
    watch: true,
    watchFolders: [p('/root')],
  };

  async function createResolver(config = {}, platform = '') {
    const DependencyGraph = require('../../node-haste/DependencyGraph');
    const dependencyGraph = new DependencyGraph(
      mergeConfig(defaultConfig, config),
    );
    await dependencyGraph.ready();

    return {
      resolve: (from, to, options) =>
        dependencyGraph.resolveDependency(from, to, platform, options),
      end: dependencyGraph.end.bind(dependencyGraph),
    };
  }

  function p(posixPath: string): string {
    if (osPlatform === 'win32') {
      return path.win32.join('C:\\', ...posixPath.split('/'));
    }

    return posixPath;
  }

  const joinPath = osPlatform === 'win32' ? path.win32.join : path.posix.join;

  describe(osPlatform, () => {
    let originalError = console.error;
    beforeEach(() => {
      jest.resetModules();

      Object.defineProperty(process, 'platform', {
        configurable: true,
        enumerable: true,
        value: osPlatform,
      });

      if (osPlatform === 'win32') {
        jest.mock('path', () => jest.requireActual('path').win32);
        jest.mock(
          'fs',
          () => new (require('metro-memory-fs'))({platform: 'win32'}),
        );
      } else {
        jest.mock('path', () => jest.requireActual('path'));
        jest.mock('fs', () => new (require('metro-memory-fs'))());
      }

      require('os').tmpdir = () => p('/tmp');

      fs = require('fs');
      originalError = console.error;
      console.error = jest.fn((...args) => {
        // Silence expected errors that we assert on later
        if (
          typeof args[0] === 'string' &&
          args[0].startsWith('metro-file-map:')
        ) {
          return;
        }
        originalError(...args);
      });
    });

    afterEach(async () => {
      try {
        resolver && (await resolver.end());
      } finally {
        resolver = null;
        console.error = originalError;
      }
    });

    describe('relative paths', () => {
      it('resolves standard relative paths with extension', async () => {
        setMockFileSystem({
          'index.js': '',
          'a.js': '',
        });

        resolver = await createResolver();

        expect(resolver.resolve(p('/root/index.js'), './a.js')).toBe(
          p('/root/a.js'),
        );
      });

      it('resolves relative paths without extension', async () => {
        setMockFileSystem({
          'index.js': '',
          'a.js': '',
        });

        resolver = await createResolver();

        expect(resolver.resolve(p('/root/index.js'), './a')).toBe(
          p('/root/a.js'),
        );
      });

      it('resolves extensions correctly', async () => {
        setMockFileSystem({
          'index.js': '',
          'a.js': '',
          'a.js.another': '',
        });

        resolver = await createResolver();

        expect(resolver.resolve(p('/root/index.js'), './a')).toBe(
          p('/root/a.js'),
        );
      });

      it('resolves shorthand syntax for parent directory', async () => {
        setMockFileSystem({
          'index.js': '',
          'foo.js': '',
          folderA: {
            'foo.js': '',
            'index.js': '',
            folderB: {
              'foo.js': '',
              'index.js': '',
            },
          },
        });

        resolver = await createResolver();

        expect(resolver.resolve(p('/root/folderA/folderB/foo.js'), '..')).toBe(
          p('/root/folderA/index.js'),
        );
        expect(
          resolver.resolve(p('/root/folderA/folderB/index.js'), '..'),
        ).toBe(p('/root/folderA/index.js'));
        expect(resolver.resolve(p('/root/folderA/foo.js'), '..')).toBe(
          p('/root/index.js'),
        );
      });

      it('resolves shorthand syntax for relative index module', async () => {
        setMockFileSystem({
          'index.js': '',
          'foo.js': '',
        });

        resolver = await createResolver();

        expect(resolver.resolve(p('/root/foo.js'), '.')).toBe(
          p('/root/index.js'),
        );
      });

      it('resolves shorthand syntax for nested relative index module with resolution cache', async () => {
        setMockFileSystem({
          'index.js': '',
          'foo.js': '',
          folderA: {
            'foo.js': '',
            'index.js': '',
          },
        });

        resolver = await createResolver();

        expect(resolver.resolve(p('/root/foo.js'), '.')).toBe(
          p('/root/index.js'),
        );
        expect(resolver.resolve(p('/root/folderA/foo.js'), '.')).toBe(
          p('/root/folderA/index.js'),
        );
      });

      it('resolves custom extensions in the correct order', async () => {
        setMockFileSystem({
          'index.js': '',
          'a.another': '',
          'a.js': '',
        });

        const {resolve, end} = await createResolver({
          resolver: {sourceExts: ['another', 'js']},
        });
        expect(resolve(p('/root/index.js'), './a')).toBe(p('/root/a.another'));
        end();

        resolver = await createResolver({
          resolver: {sourceExts: ['js', 'another']},
        });
        expect(resolver.resolve(p('/root/index.js'), './a')).toBe(
          p('/root/a.js'),
        );
      });

      it('fails when trying to require a non supported extension', async () => {
        setMockFileSystem({
          'index.js': mockFileImport("import root from './a.another';"),
          'a.another': '',
        });

        resolver = await createResolver();
        expect(() =>
          resolver.resolve(p('/root/index.js'), './a.another'),
        ).toThrowErrorMatchingSnapshot();
      });

      it('resolves relative paths on different folders', async () => {
        setMockFileSystem({
          'index.js': '',
          folder: {
            'foo.js': '',
            'index.js': '',
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), './folder/foo')).toBe(
          p('/root/folder/foo.js'),
        );
        expect(resolver.resolve(p('/root/index.js'), './folder')).toBe(
          p('/root/folder/index.js'),
        );
        expect(resolver.resolve(p('/root/index.js'), './folder/')).toBe(
          p('/root/folder/index.js'),
        );
      });

      it('resolves files when there is a folder with the same name', async () => {
        setMockFileSystem({
          'index.js': '',
          folder: {
            'index.js': '',
          },
          'folder.js': '',
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), './folder')).toBe(
          p('/root/folder.js'),
        );
        expect(resolver.resolve(p('/root/index.js'), './folder.js')).toBe(
          p('/root/folder.js'),
        );
      });
    });

    describe('absolute paths', () => {
      it('supports requiring absolute paths', async () => {
        setMockFileSystem({
          'index.js': '',
          folder: {
            'index.js': '',
          },
        });

        resolver = await createResolver();
        expect(
          resolver.resolve(p('/root/index.js'), p('/root/folder/index.js')),
        ).toBe(p('/root/folder/index.js'));
      });
    });

    describe('packages in node_modules/', () => {
      it('resolves package.json files as normal modules', async () => {
        setMockFileSystem({
          'index.js': '',
          'package.json': JSON.stringify({name: 'package'}),
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), './package.json')).toBe(
          p('/root/package.json'),
        );
      });

      it('finds nested packages in node_modules', async () => {
        setMockFileSystem({
          'index.js': mockFileImport("import qux from 'qux';"),
          node_modules: {
            foo: {
              'package.json': JSON.stringify({name: 'foo'}),
              'index.js': '',
              node_modules: {
                bar: {
                  'package.json': JSON.stringify({name: 'bar'}),
                  'index.js': '',
                },
                qux: {
                  'package.json': JSON.stringify({name: 'bar'}),
                  'index.js': '',
                },
              },
            },
            bar: {
              'package.json': JSON.stringify({name: 'bar'}),
              'index.js': '',
            },
            baz: {
              'package.json': JSON.stringify({name: 'baz'}),
              'index.js': '',
            },
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), 'bar')).toBe(
          p('/root/node_modules/bar/index.js'),
        );
        expect(() =>
          resolver.resolve(p('/root/index.js'), 'qux'),
        ).toThrowErrorMatchingSnapshot();
        expect(
          resolver.resolve(p('/root/node_modules/foo/index.js'), 'bar'),
        ).toBe(p('/root/node_modules/foo/node_modules/bar/index.js'));
        expect(
          resolver.resolve(p('/root/node_modules/foo/index.js'), 'baz'),
        ).toBe(p('/root/node_modules/baz/index.js'));
      });

      it('can require specific files inside a package', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            foo: {
              'package.json': JSON.stringify({name: 'foo'}),
              'index.js': '',
              lib: {'foo.js': '', 'index.js': ''},
            },
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), 'foo/lib/foo')).toBe(
          p('/root/node_modules/foo/lib/foo.js'),
        );
        expect(resolver.resolve(p('/root/index.js'), 'foo/lib')).toBe(
          p('/root/node_modules/foo/lib/index.js'),
        );
      });

      it('finds the appropiate node_modules folder', async () => {
        setMockFileSystem({
          node_modules: {
            foo: {
              'package.json': JSON.stringify({name: 'foo'}),
              'index.js': '',
            },
          },
          lib: {
            'index.js': '',
            subfolder: {
              anotherSubfolder: {'index.js': ''},
              node_modules: {
                foo: {
                  'package.json': JSON.stringify({name: 'foo'}),
                  'index.js': '',
                },
              },
            },
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/lib/index.js'), 'foo')).toBe(
          p('/root/node_modules/foo/index.js'),
        );
        expect(
          resolver.resolve(
            p('/root/lib/subfolder/anotherSubfolder/index.js'),
            'foo',
          ),
        ).toBe(p('/root/lib/subfolder/node_modules/foo/index.js'));
      });

      it('caches the closest node_modules folder if a flat layout is assumed', async () => {
        setMockFileSystem({
          node_modules: {
            foo: {
              'package.json': JSON.stringify({name: 'foo'}),
              'index.js': '',
            },
          },
          lib: {
            'index.js': '',
            subfolder: {
              anotherSubfolder: {'index.js': ''},
              node_modules: {
                foo: {
                  'package.json': JSON.stringify({name: 'foo'}),
                  'index.js': '',
                },
              },
            },
          },
        });

        resolver = await createResolver();
        expect(
          resolver.resolve(p('/root/lib/index.js'), 'foo', {
            assumeFlatNodeModules: true,
          }),
        ).toBe(p('/root/node_modules/foo/index.js'));
        expect(
          resolver.resolve(
            p('/root/lib/subfolder/anotherSubfolder/index.js'),
            'foo',
            {assumeFlatNodeModules: true},
          ),
        ).toBe(p('/root/node_modules/foo/index.js'));
      });

      it('works with packages with a .js extension', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            'sha.js': {
              'package.json': JSON.stringify({name: 'sha.js'}),
              'index.js': '',
            },
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), 'sha.js')).toBe(
          p('/root/node_modules/sha.js/index.js'),
        );
      });

      it('works with one-character packages', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            Y: {
              'package.json': JSON.stringify({name: 'Y'}),
              'index.js': '',
            },
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), 'Y')).toBe(
          p('/root/node_modules/Y/index.js'),
        );
      });

      it('uses the folder name and not the name in the package.json', async () => {
        setMockFileSystem({
          'index.js': mockFileImport(
            "import * as invalidName from 'invalidName';",
          ),
          node_modules: {
            foo: {
              'package.json': JSON.stringify({name: 'invalidName'}),
              'index.js': '',
            },
          },
        });

        resolver = await createResolver();

        // TODO: Should we fail here?
        expect(resolver.resolve(p('/root/index.js'), 'foo')).toBe(
          p('/root/node_modules/foo/index.js'),
        );
        expect(() =>
          resolver.resolve(p('/root/index.js'), 'invalidName'),
        ).toThrowErrorMatchingSnapshot();
      });

      it('fails if there is no package.json', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            foo: {
              'index.js': '',
            },
          },
        });

        resolver = await createResolver();

        // TODO: Is this behaviour correct?
        expect(resolver.resolve(p('/root/index.js'), 'foo')).toBe(
          p('/root/node_modules/foo/index.js'),
        );
      });

      it('resolves main package module to index.js by default', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({name: 'aPackage'}),
              'index.js': '',
            },
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), 'aPackage')).toBe(
          p('/root/node_modules/aPackage/index.js'),
        );
      });

      it('resolves main field correctly if it is a folder', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({
                name: 'aPackage',
                main: 'lib/',
              }),
              lib: {
                'index.js': '',
              },
            },
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), 'aPackage')).toBe(
          p('/root/node_modules/aPackage/lib/index.js'),
        );
      });

      it('allows package names with dots', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            'leftpad.js': {
              'package.json': JSON.stringify({name: 'leftpad.js'}),
              'index.js': '',
            },
            'x.y.z': {
              'package.json': JSON.stringify({name: 'x.y.z'}),
              'index.js': '',
            },
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), 'leftpad.js')).toBe(
          p('/root/node_modules/leftpad.js/index.js'),
        );
        expect(resolver.resolve(p('/root/index.js'), 'x.y.z')).toBe(
          p('/root/node_modules/x.y.z/index.js'),
        );
      });

      it('allows relative requires against packages', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({
                name: 'aPackage',
                main: 'main',
              }),
              'main.js': '',
            },
          },
        });

        resolver = await createResolver();
        expect(
          resolver.resolve(p('/root/index.js'), './node_modules/aPackage'),
        ).toBe(p('/root/node_modules/aPackage/main.js'));
      });

      it('allows to require package sub-dirs', async () => {
        console.warn = jest.fn();
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({name: 'aPackage'}),
              lib: {foo: {'bar.js': ''}},
            },
          },
        });

        resolver = await createResolver();
        expect(
          resolver.resolve(p('/root/index.js'), 'aPackage/lib/foo/bar'),
        ).toBe(p('/root/node_modules/aPackage/lib/foo/bar.js'));
      });

      ['browser', 'react-native'].forEach(browserField => {
        describe(`${browserField} field in package.json`, () => {
          it('supports simple field', async () => {
            setMockFileSystem({
              'index.js': '',
              node_modules: {
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    [browserField]: 'client.js',
                  }),
                  'client.js': '',
                },
              },
            });

            resolver = await createResolver();
            expect(resolver.resolve(p('/root/index.js'), 'aPackage')).toBe(
              p('/root/node_modules/aPackage/client.js'),
            );
          });

          it('overrides the main field', async () => {
            setMockFileSystem({
              'index.js': '',
              node_modules: {
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    main: 'another.js',
                    [browserField]: 'client.js',
                  }),
                  'client.js': '',
                },
              },
            });

            resolver = await createResolver();
            expect(resolver.resolve(p('/root/index.js'), 'aPackage')).toBe(
              p('/root/node_modules/aPackage/client.js'),
            );
          });

          it('can omit file extension', async () => {
            setMockFileSystem({
              'index.js': '',
              node_modules: {
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    [browserField]: 'client',
                  }),
                  'client.js': '',
                },
              },
            });

            resolver = await createResolver();
            expect(resolver.resolve(p('/root/index.js'), 'aPackage')).toBe(
              p('/root/node_modules/aPackage/client.js'),
            );
          });

          it('resolves mappings from external calls', async () => {
            setMockFileSystem({
              'index.js': '',
              node_modules: {
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    main: 'main.js',
                    [browserField]: {'main.js': 'client.js'},
                  }),
                  'client.js': '',
                  'main.js': '',
                },
              },
            });

            resolver = await createResolver();
            expect(resolver.resolve(p('/root/index.js'), 'aPackage')).toBe(
              p('/root/node_modules/aPackage/client.js'),
            );
            // TODO: Is this behaviour correct?
            expect(
              resolver.resolve(p('/root/index.js'), 'aPackage/main.js'),
            ).toBe(p('/root/node_modules/aPackage/main.js'));
          });

          it('resolves mappings without extensions', async () => {
            setMockFileSystem({
              'index.js': '',
              node_modules: {
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    main: 'main.js',
                    [browserField]: {'./main': './client'},
                  }),
                  'client.js': '',
                  'main.js': '',
                },
              },
            });

            resolver = await createResolver();
            expect(resolver.resolve(p('/root/index.js'), 'aPackage')).toBe(
              p('/root/node_modules/aPackage/client.js'),
            );
            expect(resolver.resolve(p('/root/index.js'), 'aPackage/main')).toBe(
              p('/root/node_modules/aPackage/client.js'),
            );
          });

          it('resolves mappings from internal calls', async () => {
            setMockFileSystem({
              'index.js': '',
              node_modules: {
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    main: 'main.js',
                    [browserField]: {
                      './main.js': 'main-client.js',
                      'foo.js': 'foo-client.js',
                      './dir/file.js': 'dir/file-client.js',
                      './dir': 'dir/file-client.js',
                    },
                  }),
                  'index.js': mockFileImport("import f from './foo.js';"),
                  'main-client.js': '',
                  'foo-client.js': '',
                  dir: {
                    'index.js': '',
                    'file-client.js': '',
                  },
                },
              },
            });

            resolver = await createResolver();

            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                './main.js',
              ),
            ).toBe(p('/root/node_modules/aPackage/main-client.js'));
            // TODO: Is this behaviour correct?
            expect(() =>
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                './foo.js',
              ),
            ).toThrowErrorMatchingSnapshot();
            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                './dir/file',
              ),
            ).toBe(p('/root/node_modules/aPackage/dir/file-client.js'));
            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                './dir',
              ),
            ).toBe(p('/root/node_modules/aPackage/dir/file-client.js'));
            // TODO: Is this behaviour correct?
            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                './dir/index',
              ),
            ).toBe(p('/root/node_modules/aPackage/dir/index.js'));
            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/dir/index.js'),
                '../main',
              ),
            ).toBe(p('/root/node_modules/aPackage/main-client.js'));
          });

          it('resolves mappings to other packages', async () => {
            setMockFileSystem({
              node_modules: {
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    [browserField]: {
                      'left-pad': 'left-pad-browser',
                    },
                  }),
                  'index.js': mockFileImport(
                    "import main from 'left-pad/main';",
                  ),
                },
                'left-pad-browser': {
                  'package.json': JSON.stringify({
                    name: 'left-pad-browser',
                    [browserField]: {'./main.js': 'main-client'},
                  }),
                  'index.js': '',
                  'main-client.js': '',
                },
              },
            });

            resolver = await createResolver();

            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                'left-pad',
              ),
            ).toBe(p('/root/node_modules/left-pad-browser/index.js'));
            // TODO: Is this behaviour expected?
            expect(() =>
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                'left-pad/main',
              ),
            ).toThrowErrorMatchingSnapshot();
          });

          it('supports mapping a package to a file', async () => {
            setMockFileSystem({
              node_modules: {
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    [browserField]: {'left-pad': './left-pad-browser'},
                  }),
                  'index.js': '',
                  './left-pad-browser.js': '',
                },
              },
            });

            resolver = await createResolver();

            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                'left-pad',
              ),
            ).toBe(p('/root/node_modules/aPackage/left-pad-browser.js'));
          });

          it('supports excluding a package', async () => {
            setMockFileSystem({
              'emptyModule.js': '',
              'index.js': '',
              node_modules: {
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    [browserField]: {'left-pad': false, './foo.js': false},
                  }),
                  'index.js': '',
                },
              },
            });

            resolver = await createResolver({
              resolver: {emptyModulePath: p('/root/emptyModule.js')},
            });

            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                'left-pad',
              ),
            ).toBe(p('/root/emptyModule.js'));
            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                './foo',
              ),
            ).toBe(p('/root/emptyModule.js'));

            // TODO: Are the following two cases expected behaviour?
            expect(() =>
              resolver.resolve(p('/root/index.js'), 'aPackage/foo'),
            ).toThrow();
            expect(() =>
              resolver.resolve(p('/root/index.js'), 'aPackage/foo.js'),
            ).toThrow();
          });

          it('supports excluding a package when the empty module is a relative path', async () => {
            setMockFileSystem({
              'emptyModule.js': '',
              'index.js': '',
              node_modules: {
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    [browserField]: {'left-pad': false, './foo.js': false},
                  }),
                  'index.js': '',
                },
              },
            });

            resolver = await createResolver({
              resolver: {emptyModulePath: './emptyModule.js'},
            });

            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                'left-pad',
              ),
            ).toBe(p('/root/emptyModule.js'));
            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                './foo',
              ),
            ).toBe(p('/root/emptyModule.js'));

            // TODO: Are the following two cases expected behaviour?
            expect(() =>
              resolver.resolve(p('/root/index.js'), 'aPackage/foo'),
            ).toThrow();
            expect(() =>
              resolver.resolve(p('/root/index.js'), 'aPackage/foo.js'),
            ).toThrow();
          });
        });
      });

      it('uses react-native field before browser field', async () => {
        setMockFileSystem({
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({
                name: 'aPackage',
                'react-native': {'left-pad': './left-pad-react-native'},
                browser: {'left-pad': './left-pad-browser'},
              }),
              'index.js': '',
              './left-pad-react-native.js': '',
            },
          },
        });

        resolver = await createResolver();

        expect(
          resolver.resolve(
            p('/root/node_modules/aPackage/index.js'),
            'left-pad',
          ),
        ).toBe(p('/root/node_modules/aPackage/left-pad-react-native.js'));
      });

      it('works with custom main fields', async () => {
        setMockFileSystem({
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({
                name: 'aPackage',
                'custom-field': {'left-pad': './left-pad-custom'},
                browser: {'left-pad': './left-pad-browser'},
              }),
              'index.js': '',
              './left-pad-custom.js': '',
            },
          },
        });

        resolver = await createResolver({
          resolver: {resolverMainFields: ['custom-field', 'browser']},
        });

        expect(
          resolver.resolve(
            p('/root/node_modules/aPackage/index.js'),
            'left-pad',
          ),
        ).toBe(p('/root/node_modules/aPackage/left-pad-custom.js'));
      });

      it('merges custom main fields', async () => {
        setMockFileSystem({
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({
                name: 'aPackage',
                'custom-field': {'left-pad': './left-pad-custom'},
                browser: {jest: './jest-browser'},
              }),
              'index.js': '',
              './left-pad-custom.js': '',
              './jest-browser.js': '',
            },
          },
        });

        resolver = await createResolver({
          resolver: {resolverMainFields: ['custom-field', 'browser']},
        });

        expect(
          resolver.resolve(
            p('/root/node_modules/aPackage/index.js'),
            'left-pad',
          ),
        ).toBe(p('/root/node_modules/aPackage/left-pad-custom.js'));
        expect(
          resolver.resolve(p('/root/node_modules/aPackage/index.js'), 'jest'),
        ).toBe(p('/root/node_modules/aPackage/jest-browser.js'));
      });

      it('uses main attribute from custom main fields', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({
                name: 'aPackage',
                'custom-field': './main-custom',
              }),
              './main-custom.js': '',
            },
          },
        });

        resolver = await createResolver({
          resolver: {resolverMainFields: ['custom-field']},
        });
        expect(
          resolver.resolve(p('/root/node_modules/index.js'), 'aPackage'),
        ).toBe(p('/root/node_modules/aPackage/main-custom.js'));
      });
    });

    describe('platforms', () => {
      it('resolves platform-specific files', async () => {
        setMockFileSystem({
          'index.js': mockFileImport("import f from './foo.js';"),
          'foo.ios.js': '',
        });

        resolver = await createResolver({}, 'ios');

        expect(resolver.resolve(p('/root/index.js'), './foo')).toBe(
          p('/root/foo.ios.js'),
        );
        // TODO: Is this behaviour expected?
        expect(() =>
          resolver.resolve(p('/root/index.js'), './foo.js'),
        ).toThrowErrorMatchingSnapshot();
        expect(resolver.resolve(p('/root/index.js'), './foo.ios.js')).toBe(
          p('/root/foo.ios.js'),
        );
      });

      it('takes precedence over non-platform files', async () => {
        setMockFileSystem({
          'index.js': '',
          'foo.ios.js': '',
          'foo.js': '',
        });

        resolver = await createResolver({}, 'ios');

        expect(resolver.resolve(p('/root/index.js'), './foo')).toBe(
          p('/root/foo.ios.js'),
        );
        // TODO: Is this behaviour expected?
        expect(resolver.resolve(p('/root/index.js'), './foo.js')).toBe(
          p('/root/foo.js'),
        );
        expect(resolver.resolve(p('/root/index.js'), './foo.ios.js')).toBe(
          p('/root/foo.ios.js'),
        );
      });

      it('resolves platforms on folder index files', async () => {
        setMockFileSystem({
          'index.js': '',
          dir: {
            'index.ios.js': '',
          },
        });

        resolver = await createResolver({}, 'ios');
        expect(resolver.resolve(p('/root/index.js'), './dir/index')).toBe(
          p('/root/dir/index.ios.js'),
        );
        expect(resolver.resolve(p('/root/index.js'), './dir')).toBe(
          p('/root/dir/index.ios.js'),
        );
      });

      it('resolves platforms on the main field of node_modules packages', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
                main: './main',
              }),
              'main.ios.js': '',
            },
          },
        });

        resolver = await createResolver({}, 'ios');
        expect(resolver.resolve(p('/root/index.js'), 'foo')).toBe(
          p('/root/node_modules/foo/main.ios.js'),
        );
      });

      it('does not resolve when the main field of node_modules packages when it has the extension', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
                main: './main.js',
              }),
              'main.ios.js': '',
            },
          },
        });

        resolver = await createResolver('ios');

        // TODO: Is this behaviour expected?
        expect(() => resolver.resolve(p('/root/index.js'), 'foo')).toThrow();
      });

      it('does not resolve when the browser mappings of node_modules packages', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
                browser: {
                  bar: './bar-client',
                },
              }),
              'bar-client.ios.js': '',
            },
          },
        });

        resolver = await createResolver({}, 'ios');

        // TODO: Is this behaviour expected?
        expect(() =>
          resolver.resolve(p('/root/index.js'), 'foo/bar'),
        ).toThrow();
      });

      it('supports custom platforms even if they are not configured', async () => {
        setMockFileSystem({
          'index.js': '',
          'foo.playstation.js': '',
          'foo.xbox.js': '',
        });

        const {resolve, end} = await createResolver(
          {resolver: {platforms: ['playstation']}},
          'playstation',
        );
        expect(resolve(p('/root/index.js'), './foo')).toBe(
          p('/root/foo.playstation.js'),
        );
        end();

        resolver = await createResolver(
          {resolver: {platforms: ['playstation']}},
          'xbox',
        );
        // TODO: Is this behaviour expected?
        expect(resolver.resolve(p('/root/index.js'), './foo')).toBe(
          p('/root/foo.xbox.js'),
        );
      });
    });

    describe('assets', () => {
      it('resolves a standard asset', async () => {
        setMockFileSystem({
          'index.js': '',
          'asset.png': '',
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), './asset.png')).toBe(
          p('/root/asset.png'),
        );
      });

      it('resolves asset files with resolution suffixes (matching size)', async () => {
        setMockFileSystem({
          'index.js': mockFileImport("import a from './a@1.5x.png';"),
          'a@1.5x.png': '',
          'c.png': '',
          'c@2x.png': '',
        });

        resolver = await createResolver();

        expect(resolver.resolve(p('/root/index.js'), './a.png')).toBe(
          p('/root/a@1.5x.png'),
        );
        expect(() =>
          resolver.resolve(p('/root/index.js'), './a@1.5x.png'),
        ).toThrowErrorMatchingSnapshot();
      });

      it('resolves asset files with resolution suffixes (matching exact)', async () => {
        setMockFileSystem({
          'index.js': mockFileImport("import a from './c@2x.png';"),
          'a@1.5x.png': '',
          'c.png': '',
          'c@2x.png': '',
        });

        resolver = await createResolver();

        expect(resolver.resolve(p('/root/index.js'), './c.png')).toBe(
          p('/root/c.png'),
        );
        expect(() =>
          resolver.resolve(p('/root/index.js'), './c@2x.png'),
        ).toThrowErrorMatchingSnapshot();
      });

      it('checks asset extensions case insensitively', async () => {
        setMockFileSystem({
          'index.js': mockFileImport("import a from './asset.PNG';"),
          'asset.PNG': '',
        });

        resolver = await createResolver();

        // TODO: Is this behaviour correct?
        expect(() =>
          resolver.resolve(p('/root/index.js'), './asset.PNG'),
        ).toThrowErrorMatchingSnapshot();
      });

      it('resolves custom asset extensions when overriding assetExts', async () => {
        setMockFileSystem({
          'index.js': mockFileImport("import a from './asset2.png';"),
          'asset1.ast': '',
          'asset2.png': '',
        });

        resolver = await createResolver({resolver: {assetExts: ['ast']}});

        expect(resolver.resolve(p('/root/index.js'), './asset1.ast')).toBe(
          p('/root/asset1.ast'),
        );
        expect(() =>
          resolver.resolve(p('/root/index.js'), './asset2.png'),
        ).toThrowErrorMatchingSnapshot();
      });

      it('resolves assets from packages in node_modules', async () => {
        setMockFileSystem({
          folder: {'index.js': ''},
          node_modules: {
            foo: {
              'package.json': JSON.stringify({name: 'foo'}),
              'asset.png': '',
            },
          },
        });

        resolver = await createResolver();

        expect(
          resolver.resolve(p('/root/folder/index.js'), 'foo/asset.png'),
        ).toBe(p('/root/node_modules/foo/asset.png'));
      });
    });

    describe('global packages', () => {
      it('treats any folder with a package.json as a global package', async () => {
        setMockFileSystem({
          'index.js': '',
          aPackage: {
            'package.json': JSON.stringify({
              name: 'aPackage',
              main: 'main.js',
            }),
            'main.js': '',
            'other.js': '',
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), 'aPackage')).toBe(
          p('/root/aPackage/main.js'),
        );
        expect(resolver.resolve(p('/root/index.js'), 'aPackage/')).toBe(
          p('/root/aPackage/main.js'),
        );
        expect(resolver.resolve(p('/root/index.js'), 'aPackage/other')).toBe(
          p('/root/aPackage/other.js'),
        );
      });

      it('resolves main package module to index.js by default', async () => {
        setMockFileSystem({
          'index.js': '',
          aPackage: {
            'package.json': JSON.stringify({name: 'aPackage'}),
            'index.js': '',
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), 'aPackage')).toBe(
          p('/root/aPackage/index.js'),
        );
      });

      it('uses the name in the package.json as the package name', async () => {
        setMockFileSystem({
          'index.js': mockFileImport("import a from 'aPackage';"),
          aPackage: {
            'package.json': JSON.stringify({}),
            'index.js': '',
          },
          randomFolderName: {
            'package.json': JSON.stringify({name: 'bPackage'}),
            'index.js': '',
          },
        });

        resolver = await createResolver();
        expect(() =>
          resolver.resolve(p('/root/index.js'), 'aPackage'),
        ).toThrowErrorMatchingSnapshot();
        expect(resolver.resolve(p('/root/index.js'), 'bPackage')).toBe(
          p('/root/randomFolderName/index.js'),
        );
      });

      it('uses main field from the package.json', async () => {
        setMockFileSystem({
          'index.js': '',
          aPackage: {
            'package.json': JSON.stringify({name: 'aPackage', main: 'lib/'}),
            lib: {
              'index.js': '',
            },
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), 'aPackage')).toBe(
          p('/root/aPackage/lib/index.js'),
        );
      });

      it('supports package names with dots', async () => {
        setMockFileSystem({
          'index.js': '',
          'leftpad.js': {
            'package.json': JSON.stringify({name: 'leftpad.js'}),
            'index.js': '',
          },
          'x.y.z': {
            'package.json': JSON.stringify({name: 'x.y.z'}),
            'index.js': '',
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), 'leftpad.js')).toBe(
          p('/root/leftpad.js/index.js'),
        );
        expect(resolver.resolve(p('/root/index.js'), 'x.y.z')).toBe(
          p('/root/x.y.z/index.js'),
        );
      });

      it('allows relative requires against packages', async () => {
        setMockFileSystem({
          'index.js': '',
          aPackage: {
            'package.json': JSON.stringify({name: 'aPackage', main: 'main'}),
            'main.js': '',
          },
          anotherPackage: {
            'package.json': JSON.stringify({name: 'bPackage', main: 'main'}),
            'main.js': '',
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), './aPackage')).toBe(
          p('/root/aPackage/main.js'),
        );
        expect(
          resolver.resolve(p('/root/aPackage/index.js'), '../anotherPackage'),
        ).toBe(p('/root/anotherPackage/main.js'));
      });

      it('fatals on multiple packages with the same name', async () => {
        console.warn = jest.fn();
        setMockFileSystem({
          'index.js': '',
          aPackage: {
            'package.json': JSON.stringify({name: 'aPackage'}),
          },
          anotherPackage: {
            'package.json': JSON.stringify({name: 'aPackage', main: 'main'}),
            'main.js': '',
          },
        });

        await expect(createResolver()).rejects.toThrow(
          'Duplicated files or mocks. Please check the console for more info',
        );
        expect(console.error).toHaveBeenCalledWith(
          [
            'metro-file-map: Haste module naming collision: aPackage',
            '  The following files share their name; please adjust your hasteImpl:',
            `    * ${joinPath('<rootDir>', 'aPackage', 'package.json')}`,
            `    * ${joinPath('<rootDir>', 'anotherPackage', 'package.json')}`,
            '',
          ].join('\n'),
        );
      });

      it('does not support multiple global packages for different platforms', async () => {
        setMockFileSystem({
          'index.js': '',
          'aPackage.android.js': {
            'package.json': JSON.stringify({name: 'aPackage'}),
            'index.js': '',
          },
          'aPackage.ios.js': {
            'package.json': JSON.stringify({name: 'aPackage'}),
            'index.js': '',
          },
        });

        await expect(createResolver()).rejects.toThrow(
          'Duplicated files or mocks. Please check the console for more info',
        );
        expect(console.error).toHaveBeenCalledWith(
          [
            'metro-file-map: Haste module naming collision: aPackage',
            '  The following files share their name; please adjust your hasteImpl:',
            `    * ${joinPath(
              '<rootDir>',
              'aPackage.android.js',
              'package.json',
            )}`,
            `    * ${joinPath('<rootDir>', 'aPackage.ios.js', 'package.json')}`,
            '',
          ].join('\n'),
        );
      });

      it('resolves global packages before node_modules packages', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            foo: {
              'package.json': JSON.stringify({name: 'foo'}),
              'index.js': '',
            },
          },
          foo: {
            'package.json': JSON.stringify({name: 'foo'}),
            'index.js': '',
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), 'foo')).toBe(
          p('/root/foo/index.js'),
        );
      });

      it('allows to require global package sub-dirs', async () => {
        console.warn = jest.fn();
        setMockFileSystem({
          'index.js': '',
          aPackage: {
            'package.json': JSON.stringify({name: 'aPackage'}),
            lib: {foo: {'bar.js': ''}},
          },
        });

        resolver = await createResolver();
        expect(
          resolver.resolve(p('/root/index.js'), 'aPackage/lib/foo/bar'),
        ).toBe(p('/root/aPackage/lib/foo/bar.js'));
      });

      ['browser', 'react-native'].forEach(browserField => {
        describe(`${browserField} field in global packages`, () => {
          it('supports simple field', async () => {
            setMockFileSystem({
              'index.js': '',
              aPackage: {
                'package.json': JSON.stringify({
                  name: 'aPackage',
                  [browserField]: 'client.js',
                }),
                'client.js': '',
              },
            });

            resolver = await createResolver();
            expect(resolver.resolve(p('/root/index.js'), 'aPackage')).toBe(
              p('/root/aPackage/client.js'),
            );
          });

          it('resolves mappings without extensions', async () => {
            setMockFileSystem({
              'index.js': '',
              aPackage: {
                'package.json': JSON.stringify({
                  name: 'aPackage',
                  main: 'main.js',
                  [browserField]: {'./main': './client'},
                }),
                'client.js': '',
                'main.js': '',
              },
            });

            resolver = await createResolver();
            expect(resolver.resolve(p('/root/index.js'), 'aPackage')).toBe(
              p('/root/aPackage/client.js'),
            );
            // TODO: Is this behaviour correct?
            expect(resolver.resolve(p('/root/index.js'), 'aPackage/main')).toBe(
              p('/root/aPackage/main.js'),
            );
          });
        });
      });

      it('works with custom main fields', async () => {
        setMockFileSystem({
          aPackage: {
            'package.json': JSON.stringify({
              name: 'aPackage',
              'custom-field': {'left-pad': './left-pad-custom'},
              browser: {'left-pad': './left-pad-browser'},
            }),
            'index.js': '',
            './left-pad-custom.js': '',
          },
        });

        resolver = await createResolver({
          resolver: {resolverMainFields: ['custom-field', 'browser']},
        });

        expect(resolver.resolve(p('/root/aPackage/index.js'), 'left-pad')).toBe(
          p('/root/aPackage/left-pad-custom.js'),
        );
      });
    });

    describe('hasteImpl config param', () => {
      let config;

      beforeEach(() => {
        config = {
          resolver: {
            hasteImplModulePath: path.join(
              __dirname,
              '../__fixtures__/hasteImpl.js',
            ),
          },
        };
      });

      it('resolves haste names globally', async () => {
        setMockFileSystem({
          'index.js': '',
          'hasteModule.js': '@providesModule hasteModule',
        });

        resolver = await createResolver(config);
        expect(resolver.resolve(p('/root/index.js'), 'hasteModule')).toBe(
          p('/root/hasteModule.js'),
        );
      });

      it('does not take file name or extension into account', async () => {
        setMockFileSystem({
          'index.js': mockFileImport("import module from 'hasteModule.js';"),
          'lib.js': mockFileImport("import invalid from 'invalidName';"),
          'hasteModule.js': '@providesModule hasteModule',
          'invalidName.js': '@providesModule anotherHasteModule',
        });

        resolver = await createResolver(config);
        expect(() =>
          resolver.resolve(p('/root/index.js'), 'hasteModule.js'),
        ).toThrowErrorMatchingSnapshot();
        expect(() =>
          resolver.resolve(p('/root/lib.js'), 'invalidName'),
        ).toThrowErrorMatchingSnapshot();
      });

      it('checks for haste modules in different folder', async () => {
        setMockFileSystem({
          'index.js': '',
          dir: {subdir: {'hasteModule.js': '@providesModule hasteModule'}},
        });

        resolver = await createResolver(config);
        expect(resolver.resolve(p('/root/index.js'), 'hasteModule')).toBe(
          p('/root/dir/subdir/hasteModule.js'),
        );
      });

      it('fatals when there are duplicated haste names', async () => {
        setMockFileSystem({
          'index.js': '',
          'hasteModule.js': '@providesModule hasteModule',
          'anotherHasteModule.js': '@providesModule hasteModule',
        });

        await expect(createResolver(config)).rejects.toThrow(
          'Duplicated files or mocks. Please check the console for more info',
        );
        expect(console.error).toHaveBeenCalledWith(
          [
            'metro-file-map: Haste module naming collision: hasteModule',
            '  The following files share their name; please adjust your hasteImpl:',
            `    * ${joinPath('<rootDir>', 'hasteModule.js')}`,
            `    * ${joinPath('<rootDir>', 'anotherHasteModule.js')}`,
            '',
          ].join('\n'),
        );
      });

      it('resolves a haste module before a package in node_modules', async () => {
        setMockFileSystem({
          'index.js': '',
          'hasteModule.js': '@providesModule hasteModule',
          node_modules: {
            hasteModule: {
              'package.json': JSON.stringify({name: 'hasteModule'}),
              'index.js': '',
            },
          },
        });

        resolver = await createResolver(config);
        expect(resolver.resolve(p('/root/index.js'), 'hasteModule')).toBe(
          p('/root/hasteModule.js'),
        );
      });

      it('fatals when a haste module collides with a global package', async () => {
        setMockFileSystem({
          'index.js': '',
          'hasteModule.js': '@providesModule hasteModule',
          aPackage: {
            'package.json': JSON.stringify({name: 'hasteModule'}),
          },
        });

        await expect(createResolver(config)).rejects.toThrow(
          'Duplicated files or mocks. Please check the console for more info',
        );
        expect(console.error).toHaveBeenCalledWith(
          [
            'metro-file-map: Haste module naming collision: hasteModule',
            '  The following files share their name; please adjust your hasteImpl:',
            `    * ${joinPath('<rootDir>', 'hasteModule.js')}`,
            `    * ${joinPath('<rootDir>', 'aPackage', 'package.json')}`,
            '',
          ].join('\n'),
        );
      });

      it('supports collisions between haste names and global packages if they have different platforms', async () => {
        setMockFileSystem({
          'index.js': '',
          'hasteModule.ios.js': '@providesModule hasteModule',
          aPackage: {
            'package.json': JSON.stringify({name: 'hasteModule'}),
            'index.js': '',
          },
        });

        const {resolve, end} = await createResolver(config, 'ios');
        expect(resolve(p('/root/index.js'), 'hasteModule')).toBe(
          p('/root/hasteModule.ios.js'),
        );
        end();

        resolver = await createResolver(config, 'android');
        expect(resolver.resolve(p('/root/index.js'), 'hasteModule')).toBe(
          p('/root/aPackage/index.js'),
        );
      });

      it('resolves duplicated haste names when the filenames have different platforms', async () => {
        setMockFileSystem({
          'index.js': '',
          'hasteModule.js': '@providesModule hasteModule',
          'hasteModule.ios.js': '@providesModule hasteModule',
        });

        const {resolve, end} = await createResolver(config, 'ios');
        expect(resolve(p('/root/index.js'), 'hasteModule')).toBe(
          p('/root/hasteModule.ios.js'),
        );
        end();

        resolver = await createResolver(config, 'android');
        expect(resolver.resolve(p('/root/index.js'), 'hasteModule')).toBe(
          p('/root/hasteModule.js'),
        );
      });

      it('fatals when a filename uses a non-supported platform and there are collisions', async () => {
        setMockFileSystem({
          'index.js': '',
          'hasteModule.js': '@providesModule hasteModule',
          'hasteModule.invalid.js': '@providesModule hasteModule',
        });

        await expect(createResolver(config)).rejects.toThrow(
          'Duplicated files or mocks. Please check the console for more info',
        );
        expect(console.error).toHaveBeenCalledWith(
          [
            'metro-file-map: Haste module naming collision: hasteModule',
            '  The following files share their name; please adjust your hasteImpl:',
            `    * ${joinPath('<rootDir>', 'hasteModule.js')}`,
            `    * ${joinPath('<rootDir>', 'hasteModule.invalid.js')}`,
            '',
          ].join('\n'),
        );
      });

      it('does not resolve haste names in node_modules folders', async () => {
        setMockFileSystem({
          'index.js': mockFileImport("import hasteModule from 'hasteModule';"),
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({name: 'aPackage'}),
              'hasteModule.js': '@providesModule hasteModule',
            },
          },
        });

        resolver = await createResolver(config);
        expect(() =>
          resolver.resolve(p('/root/index.js'), 'hasteModule'),
        ).toThrowErrorMatchingSnapshot();
      });

      it('does not cause collision with haste modules in node_modules', async () => {
        setMockFileSystem({
          'index.js': '',
          'hasteModule.js': '@providesModule hasteModule',
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({name: 'aPackage'}),
              'hasteModule.js': '@providesModule hasteModule',
            },
          },
        });

        resolver = await createResolver(config);
        expect(resolver.resolve(p('/root/index.js'), 'hasteModule')).toBe(
          p('/root/hasteModule.js'),
        );
      });

      it('respects package.json replacements for global (Haste) packages', async () => {
        setMockFileSystem({
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({
                name: 'aPackage',
                browser: {hastePackage: './hastePackage-local-override'},
              }),
              'index.js': '',
              './hastePackage-local-override.js': '',
            },
          },
          hastePackage: {
            'package.json': JSON.stringify({
              name: 'hastePackage',
            }),
            'index.js': '',
          },
        });

        resolver = await createResolver(config);

        expect(
          resolver.resolve(
            p('/root/node_modules/aPackage/index.js'),
            'hastePackage',
          ),
        ).toBe(p('/root/node_modules/aPackage/hastePackage-local-override.js'));
      });

      it('respects package.json replacements for Haste modules', async () => {
        setMockFileSystem({
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({
                name: 'aPackage',
                browser: {hasteModule: './hasteModule-local-override'},
              }),
              'index.js': '',
              './hasteModule-local-override.js': '',
            },
          },
          'hasteModule.js': '@providesModule hasteModule',
        });

        resolver = await createResolver(config);

        expect(
          resolver.resolve(
            p('/root/node_modules/aPackage/index.js'),
            'hasteModule',
          ),
        ).toBe(p('/root/node_modules/aPackage/hasteModule-local-override.js'));
      });
    });

    describe('extraNodeModules config param', () => {
      it('works when it points to folders or packages', async () => {
        setMockFileSystem({
          folder: {'index.js': ''},
          providesFoo: {
            'package.json': JSON.stringify({main: 'lib/bar'}),
            lib: {'bar.js': ''},
          },
          providesBar: {'index.js': ''},
        });

        resolver = await createResolver({
          resolver: {
            extraNodeModules: {
              foo: p('/root/providesFoo'),
              bar: p('/root/providesBar'),
            },
          },
        });

        expect(resolver.resolve(p('/root/folder/index.js'), 'foo')).toBe(
          p('/root/providesFoo/lib/bar.js'),
        );
        expect(resolver.resolve(p('/root/folder/index.js'), 'bar')).toBe(
          p('/root/providesBar/index.js'),
        );
      });

      it('uses extraNodeModules only after checking all possible filesystem locations', async () => {
        setMockFileSystem({
          folder: {'index.js': ''},
          providesFoo: {
            'package.json': '{}',
            'index.js': '',
          },
          foo: {
            'package.json': JSON.stringify({name: 'foo'}),
            lib: {'bar.js': ''},
            'index.js': '',
          },
        });

        resolver = await createResolver({
          resolver: {extraNodeModules: {foo: p('/root/providesFoo')}},
        });

        expect(resolver.resolve(p('/root/folder/index.js'), 'foo')).toBe(
          p('/root/foo/index.js'),
        );
        expect(
          resolver.resolve(p('/root/folder/index.js'), 'foo/lib/bar'),
        ).toBe(p('/root/foo/lib/bar.js'));
      });

      it('supports scoped `extraNodeModules`', async () => {
        setMockFileSystem({
          folder: {'index.js': ''},
          providesFoo: {
            'package.json': '{}',
            lib: {'bar.js': ''},
            'index.js': '',
          },
        });

        resolver = await createResolver({
          resolver: {extraNodeModules: {'@foo/bar': p('/root/providesFoo')}},
        });

        expect(resolver.resolve(p('/root/folder/index.js'), '@foo/bar')).toBe(
          p('/root/providesFoo/index.js'),
        );
        expect(
          resolver.resolve(p('/root/folder/index.js'), '@foo/bar/lib/bar'),
        ).toBe(p('/root/providesFoo/lib/bar.js'));
      });

      it('supports browser mappings in its package.json', async () => {
        setMockFileSystem({
          folder: {'index.js': ''},
          providesFoo: {
            'package.json': JSON.stringify({
              browser: {'index.js': 'index-client.js'},
            }),
            'index.js': '',
            'index-client.js': '',
          },
        });

        resolver = await createResolver({
          resolver: {extraNodeModules: {foo: p('/root/providesFoo')}},
        });

        expect(resolver.resolve(p('/root/folder/index.js'), 'foo')).toBe(
          p('/root/providesFoo/index-client.js'),
        );
      });

      it('resolves assets', async () => {
        setMockFileSystem({
          folder: {'index.js': ''},
          providesFoo: {'asset.png': ''},
        });

        resolver = await createResolver({
          resolver: {extraNodeModules: {foo: p('/root/providesFoo')}},
        });

        expect(
          resolver.resolve(p('/root/folder/index.js'), 'foo/asset.png'),
        ).toBe(p('/root/providesFoo/asset.png'));
      });
    });

    describe('resolveRequest config param', () => {
      let resolveRequest;

      beforeEach(() => {
        resolveRequest = jest.fn().mockReturnValue({
          type: 'sourceFile',
          filePath: p('/root/overriden.js'),
        });
      });

      it('overrides relative paths', async () => {
        setMockFileSystem({
          'index.js': '',
          myFolder: {'foo.js': ''},
          'overriden.js': '',
        });

        resolver = await createResolver({resolver: {resolveRequest}});

        expect(resolver.resolve(p('/root/index.js'), './myFolder/foo')).toBe(
          p('/root/overriden.js'),
        );
        expect(resolver.resolve(p('/root/index.js'), './invalid')).toBe(
          p('/root/overriden.js'),
        );
      });

      it('overrides node_modules package resolutions', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({name: 'aPackage'}),
              'index.js': '',
            },
          },
          'overriden.js': '',
        });

        resolver = await createResolver({resolver: {resolveRequest}});

        expect(resolver.resolve(p('/root/index.js'), 'aPackage')).toBe(
          p('/root/overriden.js'),
        );
      });

      it('overrides global package resolutions', async () => {
        setMockFileSystem({
          'index.js': '',
          aPackage: {
            'package.json': JSON.stringify({name: 'aPackage'}),
            'index.js': '',
          },
          'overriden.js': '',
        });

        resolver = await createResolver({resolver: {resolveRequest}});

        expect(resolver.resolve(p('/root/index.js'), 'aPackage')).toBe(
          p('/root/overriden.js'),
        );
      });

      it('overrides haste names', async () => {
        setMockFileSystem({
          'index.js': '',
          'aPackage.js': '@providesModule aPackage',
          'overriden.js': '',
        });

        resolver = await createResolver({
          resolver: {
            resolveRequest,
            hasteImplModulePath: path.join(
              __dirname,
              '../__fixtures__/hasteImpl.js',
            ),
          },
        });

        expect(resolver.resolve(p('/root/index.js'), 'aPackage')).toBe(
          p('/root/overriden.js'),
        );
      });

      it('calls resolveRequest with the correct arguments', async () => {
        setMockFileSystem({
          'index.js': '',
          'foo.js': '',
          'overriden.js': '',
        });

        resolver = await createResolver({resolver: {resolveRequest}}, 'ios');

        resolver.resolve(p('/root/index.js'), './foo');

        const [context, request, platform] = resolveRequest.mock.calls[0];

        expect(context.originModulePath).toEqual(p('/root/index.js'));
        expect(request).toEqual('./foo');
        expect(platform).toEqual('ios');
      });

      it('caches resolutions by origin folder', async () => {
        setMockFileSystem({
          root1: {
            dir: {
              'a.js': '',
              'b.js': '',
            },
          },
          root2: {
            dir: {
              'a.js': '',
              'b.js': '',
            },
          },
          'target1.js': {},
          'target2.js': {},
        });
        resolver = await createResolver({resolver: {resolveRequest}});

        resolveRequest.mockReturnValue({
          type: 'sourceFile',
          filePath: p('/target1.js'),
        });
        expect(resolver.resolve(p('/root1/dir/a.js'), 'target')).toBe(
          p('/target1.js'),
        );
        expect(resolver.resolve(p('/root1/dir/b.js'), 'target')).toBe(
          p('/target1.js'),
        );
        expect(resolveRequest).toHaveBeenCalledTimes(1);
        expect(resolver.resolve(p('/root1/fake.js'), 'target')).toBe(
          p('/target1.js'),
        );
        expect(resolveRequest).toHaveBeenCalledTimes(2);

        resolveRequest.mockReturnValue({
          type: 'sourceFile',
          filePath: p('/target2.js'),
        });
        expect(resolver.resolve(p('/root2/dir/a.js'), 'target')).toBe(
          p('/target2.js'),
        );
        expect(resolver.resolve(p('/root2/dir/b.js'), 'target')).toBe(
          p('/target2.js'),
        );
        expect(resolveRequest).toHaveBeenCalledTimes(3);
        expect(resolver.resolve(p('/root2/fake.js'), 'target')).toBe(
          p('/target2.js'),
        );
        expect(resolveRequest).toHaveBeenCalledTimes(4);
      });

      it('caches resolutions globally if assumeFlatNodeModules=true', async () => {
        setMockFileSystem({
          root1: {
            dir: {
              'a.js': '',
              'b.js': '',
            },
          },
          root2: {
            dir: {
              'a.js': '',
              'b.js': '',
            },
          },
          'target-always.js': {},
          'target-never.js': {},
        });
        resolver = await createResolver({resolver: {resolveRequest}});

        resolveRequest.mockReturnValue({
          type: 'sourceFile',
          filePath: p('/target-always.js'),
        });
        expect(
          resolver.resolve(p('/root1/dir/a.js'), 'target', {
            assumeFlatNodeModules: true,
          }),
        ).toBe(p('/target-always.js'));
        expect(
          resolver.resolve(p('/root1/dir/b.js'), 'target', {
            assumeFlatNodeModules: true,
          }),
        ).toBe(p('/target-always.js'));

        resolveRequest.mockReturnValue({
          type: 'sourceFile',
          filePath: p('/target-never.js'),
        });
        expect(
          resolver.resolve(p('/root2/dir/a.js'), 'target', {
            assumeFlatNodeModules: true,
          }),
        ).toBe(p('/target-always.js'));
        expect(
          resolver.resolve(p('/root2/dir/b.js'), 'target', {
            assumeFlatNodeModules: true,
          }),
        ).toBe(p('/target-always.js'));

        expect(resolveRequest).toHaveBeenCalledTimes(1);
      });
    });
  });
});
