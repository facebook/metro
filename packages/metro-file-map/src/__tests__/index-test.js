/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import crypto from 'crypto';
import * as path from 'path';
import {serialize} from 'v8';

jest.useRealTimers();

function mockHashContents(contents) {
  return crypto.createHash('sha1').update(contents).digest('hex');
}

jest.mock('../lib/checkWatchmanCapabilities', () => ({
  __esModule: true,
  default: async () => ({version: 'v123'}),
}));

jest.mock('jest-worker', () => ({
  Worker: jest.fn(worker => {
    mockWorker = jest.fn((...args) => require(worker).worker(...args));
    mockEnd = jest.fn();

    return {
      end: mockEnd,
      worker: mockWorker,
    };
  }),
}));

jest.mock('../crawlers/node');
jest.mock('../crawlers/watchman', () =>
  jest.fn(options => {
    const path = require('path');

    const {
      previousState,
      ignore,
      rootDir,
      roots,
      computeSha1,
      includeSymlinks,
    } = options;
    const list = mockChangedFiles || mockFs;
    const removedFiles = new Set();
    const changedFiles = new Map();

    previousState.clocks = mockClocks;

    for (const file in list) {
      if (
        new RegExp(roots.join('|').replaceAll('\\', '\\\\')).test(file) &&
        !ignore(file)
      ) {
        const relativeFilePath = path.relative(rootDir, file);
        if (list[file]) {
          const hash = computeSha1 ? mockHashContents(list[file]) : null;
          const isSymlink = typeof list[file].link === 'string';
          if (!isSymlink || includeSymlinks) {
            changedFiles.set(relativeFilePath, [
              '',
              32,
              42,
              0,
              [],
              hash,
              isSymlink ? 1 : 0,
            ]);
          }
        } else {
          if (previousState.fileSystem.exists(relativeFilePath)) {
            removedFiles.add(relativeFilePath);
          }
        }
      }
    }

    return Promise.resolve({
      removedFiles,
      changedFiles,
      clocks: mockClocks,
    });
  }),
);

const mockWatcherConstructor = jest.fn(root => {
  const EventEmitter = require('events').EventEmitter;
  mockEmitters[root] = new EventEmitter();
  mockEmitters[root].close = jest.fn();
  setTimeout(() => mockEmitters[root].emit('ready'), 0);
  return mockEmitters[root];
});

jest.mock('../watchers/NodeWatcher', () => mockWatcherConstructor);
jest.mock('../watchers/WatchmanWatcher', () => mockWatcherConstructor);

let mockChangedFiles;
let mockFs;

jest.mock('fs', () => ({
  existsSync: jest.fn(path => {
    // A file change can be triggered by writing into the
    // mockChangedFiles object.
    if (mockChangedFiles && path in mockChangedFiles) {
      return true;
    }

    if (mockFs[path]) {
      return true;
    }

    return false;
  }),
  readFileSync: jest.fn((path, options) => {
    // A file change can be triggered by writing into the
    // mockChangedFiles object.
    if (mockChangedFiles && path in mockChangedFiles) {
      return mockChangedFiles[path];
    }

    if (mockFs[path]) {
      return mockFs[path];
    }

    const error = new Error(`Cannot read path '${path}'.`);
    error.code = 'ENOENT';
    throw error;
  }),
  writeFileSync: jest.fn((path, data, options) => {
    expect(options).toBe(require('v8').serialize ? undefined : 'utf8');
    mockFs[path] = data;
  }),
  promises: {
    readlink: jest.fn(async path => {
      const entry = mockFs[path];
      if (!entry) {
        const error = new Error(`Cannot read path '${path}'.`);
        error.code = 'ENOENT';
        throw error;
      }
      if (typeof entry.link !== 'string') {
        throw new Error(`Not a symlink: '${path}'.`);
      }
      return entry.link;
    }),
  },
}));

const object = data => Object.assign(Object.create(null), data);
const createMap = obj => new Map(Object.entries(obj));
const assertFileSystemEqual = (fileSystem: FileSystem, fileData: FileData) => {
  expect(fileSystem.getDifference(fileData)).toEqual({
    changedFiles: new Map(),
    removedFiles: new Set(),
  });
};

// Jest toEqual does not match Map instances from different contexts
// This normalizes them for the uses cases in this test
const deepNormalize = value => {
  const stringTag = Object.prototype.toString.call(value);
  switch (stringTag) {
    case '[object Map]':
      return new Map(
        Array.from(value).map(([k, v]) => [deepNormalize(k), deepNormalize(v)]),
      );
    case '[object Object]':
      return Object.keys(value).reduce((obj, key) => {
        obj[key] = deepNormalize(value[key]);
        return obj;
      }, {});
    default:
      return value;
  }
};

let consoleWarn;
let consoleError;
let defaultConfig;
let DuplicateHasteCandidatesError;
let fs;
let H;
let FileMap;
let mockCacheManager;
let mockClocks;
let mockEmitters;
let mockEnd;
let mockWorker;
let cacheContent = null;

describe('FileMap', () => {
  beforeEach(() => {
    jest.resetModules();

    mockEmitters = Object.create(null);
    mockFs = object({
      [path.join('/', 'project', 'fruits', 'Banana.js')]: `
        const Strawberry = require("Strawberry");
      `,
      [path.join('/', 'project', 'fruits', 'Pear.js')]: `
        const Banana = require("Banana");
        const Strawberry = require("Strawberry");
      `,
      [path.join('/', 'project', 'fruits', 'Strawberry.js')]: `
        // Strawberry!
      `,
      [path.join('/', 'project', 'fruits', '__mocks__', 'Pear.js')]: `
        const Melon = require("Melon");
      `,
      [path.join('/', 'project', 'vegetables', 'Melon.js')]: `
        // Melon!
      `,
      [path.join('/', 'project', 'video', 'video.mp4')]: Buffer.from([
        0xfa, 0xce, 0xb0, 0x0c,
      ]).toString(),
      [path.join('/', 'project', 'fruits', 'LinkToStrawberry.js')]: {
        link: 'Strawberry.js',
      },
    });
    mockClocks = createMap({
      fruits: 'c:fake-clock:1',
      vegetables: 'c:fake-clock:2',
      video: 'c:fake-clock:3',
    });

    mockChangedFiles = null;

    fs = require('graceful-fs');

    consoleWarn = console.warn;
    consoleError = console.error;

    console.warn = jest.fn();
    console.error = jest.fn();

    ({default: FileMap, DuplicateHasteCandidatesError} = require('../'));

    mockCacheManager = {
      read: jest.fn().mockImplementation(async () => cacheContent),
      write: jest.fn().mockImplementation(async dataSnapshot => {
        cacheContent = dataSnapshot;
      }),
    };

    H = FileMap.H;

    cacheContent = null;

    defaultConfig = {
      enableSymlinks: false,
      extensions: ['js', 'json'],
      hasteImplModulePath: require.resolve('./haste_impl.js'),
      healthCheck: {
        enabled: false,
        interval: 10000,
        timeout: 1000,
        filePrefix: '.metro-file-map-health-check',
      },
      maxWorkers: 1,
      name: 'haste-map-test',
      platforms: ['ios', 'android'],
      resetCache: false,
      rootDir: path.join('/', 'project'),
      roots: [
        path.join('/', 'project', 'fruits'),
        path.join('/', 'project', 'vegetables'),
      ],
      useWatchman: true,
      cacheManagerFactory: () => mockCacheManager,
    };
  });

  afterEach(() => {
    console.warn = consoleWarn;
    console.error = consoleError;
  });

  it('exports constants', () => {
    expect(FileMap.H).toBe(require('../constants'));
  });

  it('ignores files given a pattern', async () => {
    const config = {...defaultConfig, ignorePattern: /Kiwi/};
    mockFs[path.join('/', 'project', 'fruits', 'Kiwi.js')] = `
      // Kiwi!
    `;
    const {fileSystem} = await new FileMap(config).build();
    expect([...fileSystem.matchFiles({filter: /Kiwi/})]).toEqual([]);
  });

  it('ignores vcs directories without ignore pattern', async () => {
    mockFs[path.join('/', 'project', 'fruits', '.git', 'fruit-history.js')] = `
      // test
    `;
    const {fileSystem} = await new FileMap(defaultConfig).build();
    expect([...fileSystem.matchFiles({filter: /\.git/})]).toEqual([]);
  });

  it('ignores vcs directories with ignore pattern regex', async () => {
    const config = {...defaultConfig, ignorePattern: /Kiwi/};
    mockFs[path.join('/', 'project', 'fruits', 'Kiwi.js')] = `
      // Kiwi!
    `;
    mockFs[path.join('/', 'project', 'fruits', '.git', 'fruit-history.js')] = `
      // test
    `;
    const {fileSystem} = await new FileMap(config).build();
    expect([...fileSystem.matchFiles({filter: /Kiwi/})]).toEqual([]);
    expect([...fileSystem.matchFiles({filter: /\.git/})]).toEqual([]);
  });

  it('throw on ignore pattern except for regex', async () => {
    const config = {ignorePattern: 'Kiwi', ...defaultConfig};
    mockFs['/project/fruits/Kiwi.js'] = `
      // Kiwi!
    `;

    try {
      await new FileMap(config).build();
    } catch (err) {
      expect(err.message).toBe(
        'metro-file-map: the `ignorePattern` option must be a RegExp',
      );
    }
  });

  it('builds a haste map on a fresh cache', async () => {
    // Include these files in the map
    mockFs[
      path.join('/', 'project', 'fruits', 'node_modules', 'react', 'React.js')
    ] = `
      const Component = require("Component");
    `;
    mockFs[
      path.join(
        '/',
        'project',
        'fruits',
        'node_modules',
        'fbjs',
        'lib',
        'flatMap.js',
      )
    ] = `
      // flatMap
    `;

    // Ignore these
    mockFs[
      path.join(
        '/',
        'project',
        'fruits',
        'node_modules',
        'react',
        'node_modules',
        'fbjs',
        'lib',
        'mapObject.js',
      )
    ] = `
      // mapObject
    `;
    mockFs[
      path.join(
        '/',
        'project',
        'fruits',
        'node_modules',
        'react',
        'node_modules',
        'dummy',
        'merge.js',
      )
    ] = `
      // merge
    `;
    mockFs[
      path.join(
        '/',
        'project',
        'fruits',
        'node_modules',
        'react',
        'node_modules',
        'merge',
        'package.json',
      )
    ] = `
      {
        "name": "merge"
      }
    `;
    mockFs[
      path.join('/', 'project', 'fruits', 'node_modules', 'jest', 'Jest.js')
    ] = `
      const Test = require("Test");
    `;
    mockFs[
      path.join('/', 'project', 'fruits', 'node_modules', 'fbjs2', 'fbjs2.js')
    ] = `
      // fbjs2
    `;

    const fileMap = new FileMap({
      ...defaultConfig,
      mocksPattern: '__mocks__',
    });

    const {fileSystem, hasteMap, mockMap} = await fileMap.build();

    expect(cacheContent.clocks).toEqual(mockClocks);

    assertFileSystemEqual(
      fileSystem,
      createMap({
        [path.join('fruits', 'Banana.js')]: [
          'Banana',
          32,
          42,
          1,
          'Strawberry',
          null,
          0,
        ],
        [path.join('fruits', 'Pear.js')]: [
          'Pear',
          32,
          42,
          1,
          'Banana\0Strawberry',
          null,
          0,
        ],
        [path.join('fruits', 'Strawberry.js')]: [
          'Strawberry',
          32,
          42,
          1,
          '',
          null,
          0,
        ],
        [path.join('fruits', '__mocks__', 'Pear.js')]: [
          '',
          32,
          42,
          1,
          'Melon',
          null,
          0,
        ],
        [path.join('vegetables', 'Melon.js')]: [
          'Melon',
          32,
          42,
          1,
          '',
          null,
          0,
        ],
      }),
    );

    expect(hasteMap.getModule('Banana')).toEqual(
      path.join(defaultConfig.rootDir, 'fruits', 'Banana.js'),
    );
    expect(hasteMap.getModule('Melon')).toEqual(
      path.join(defaultConfig.rootDir, 'vegetables', 'Melon.js'),
    );
    expect(hasteMap.getModule('Pear')).toEqual(
      path.join(defaultConfig.rootDir, 'fruits', 'Pear.js'),
    );
    expect(hasteMap.getModule('Strawberry')).toEqual(
      path.join(defaultConfig.rootDir, 'fruits', 'Strawberry.js'),
    );

    expect(mockMap.getMockModule('Pear')).toEqual(
      path.resolve(defaultConfig.rootDir, 'fruits', '__mocks__', 'Pear.js'),
    );

    expect(cacheContent.mocks).toEqual(
      createMap({
        Pear: path.join('fruits', '__mocks__', 'Pear.js'),
      }),
    );

    // The cache file must exactly mirror the data structure returned from a
    // read
    expect(deepNormalize(await fileMap.read())).toEqual(cacheContent);
  });

  describe('builds a file map on a fresh cache with SHA-1s', () => {
    it.each([
      [false, false],
      [false, true],
      [true, false],
      [true, true],
    ])(
      'uses watchman: %s, symlinks enabled: %s',
      async (useWatchman, enableSymlinks) => {
        const node = require('../crawlers/node');

        node.mockImplementation(options => {
          // The node crawler returns "null" for the SHA-1.
          const changedFiles = createMap({
            [path.join('fruits', 'Banana.js')]: [
              'Banana',
              32,
              42,
              0,
              'Strawberry',
              null,
              0,
            ],
            [path.join('fruits', 'Pear.js')]: [
              'Pear',
              32,
              42,
              0,
              'Banana\0Strawberry',
              null,
              0,
            ],
            [path.join('fruits', 'Strawberry.js')]: [
              'Strawberry',
              32,
              42,
              0,
              '',
              null,
              0,
            ],
            [path.join('fruits', '__mocks__', 'Pear.js')]: [
              '',
              32,
              42,
              0,
              'Melon',
              null,
              0,
            ],
            [path.join('vegetables', 'Melon.js')]: [
              'Melon',
              32,
              42,
              0,
              '',
              null,
              0,
            ],
            ...(enableSymlinks
              ? {
                  [path.join('fruits', 'LinkToStrawberry.js')]: [
                    '',
                    32,
                    42,
                    0,
                    '',
                    null,
                    1,
                  ],
                }
              : null),
          });

          return Promise.resolve({
            changedFiles,
            removedFiles: new Set(),
          });
        });

        const fileMap = new FileMap({
          ...defaultConfig,
          computeSha1: true,
          maxWorkers: 1,
          enableSymlinks,
          useWatchman,
        });

        await fileMap.build();

        expect(
          createMap({
            [path.join('fruits', 'Banana.js')]: [
              'Banana',
              32,
              42,
              1,
              'Strawberry',
              '7772b628e422e8cf59c526be4bb9f44c0898e3d1',
              0,
            ],
            [path.join('fruits', 'Pear.js')]: [
              'Pear',
              32,
              42,
              1,
              'Banana\0Strawberry',
              '89d0c2cc11dcc5e1df50b8af04ab1b597acfba2f',
              0,
            ],
            [path.join('fruits', 'Strawberry.js')]: [
              'Strawberry',
              32,
              42,
              1,
              '',
              'e8aa38e232b3795f062f1d777731d9240c0f8c25',
              0,
            ],
            [path.join('fruits', '__mocks__', 'Pear.js')]: [
              '',
              32,
              42,
              1,
              'Melon',
              '8d40afbb6e2dc78e1ba383b6d02cafad35cceef2',
              0,
            ],
            [path.join('vegetables', 'Melon.js')]: [
              'Melon',
              32,
              42,
              1,
              '',
              'f16ccf6f2334ceff2ddb47628a2c5f2d748198ca',
              0,
            ],
            ...(enableSymlinks
              ? {
                  [path.join('fruits', 'LinkToStrawberry.js')]: [
                    '',
                    32,
                    42,
                    1,
                    '',
                    null,
                    'Strawberry.js',
                  ],
                }
              : null),
          }),
        );

        expect(deepNormalize(await fileMap.read())).toEqual(cacheContent);
      },
    );
  });

  it('handles a Haste module moving between builds', async () => {
    mockFs = object({
      [path.join('/', 'project', 'vegetables', 'Melon.js')]: `
        // Melon is a fruit!
      `,
    });

    const originalData = await new FileMap(defaultConfig).build();

    // Haste Melon present in its original location.
    expect(originalData.hasteMap.getModule('Melon')).toEqual(
      path.join('/', 'project', 'vegetables', 'Melon.js'),
    );

    // Haste Melon moved from vegetables to fruits since the cache was built.
    mockFs = object({
      [path.join('/', 'project', 'vegetables', 'Melon.js')]: null, // Mock deletion
      [path.join('/', 'project', 'fruits', 'Melon.js')]: `
        // Melon is a fruit!
      `,
    });

    const newData = await new FileMap(defaultConfig).build();

    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();

    // Haste Melon is in its new location and not duplicated.
    expect(newData.hasteMap.getModule('Melon')).toEqual(
      path.join('/', 'project', 'fruits', 'Melon.js'),
    );
  });

  it('does not crawl native files even if requested to do so', async () => {
    mockFs[path.join('/', 'project', 'video', 'IRequireAVideo.js')] = `
      module.exports = require("./video.mp4");
    `;

    const fileMap = new FileMap({
      ...defaultConfig,
      extensions: [...defaultConfig.extensions],
      roots: [...defaultConfig.roots, path.join('/', 'project', 'video')],
    });

    const {fileSystem, hasteMap} = await fileMap.build();

    expect(hasteMap.getModule('IRequireAVideo')).toEqual(
      path.join(defaultConfig.rootDir, 'video', 'IRequireAVideo.js'),
    );
    expect(fileSystem.linkStats(path.join('video', 'video.mp4'))).toEqual({
      fileType: 'f',
      modifiedTime: 32,
    });
    expect(fs.readFileSync.mock.calls.map(call => call[0])).not.toContain(
      path.join('video', 'video.mp4'),
    );
  });

  it('retains all files if `retainAllFiles` is specified', async () => {
    mockFs[
      path.join('/', 'project', 'fruits', 'node_modules', 'fbjs', 'fbjs.js')
    ] = `
      // fbjs!
    `;

    const fileMap = new FileMap({
      ...defaultConfig,
      mocksPattern: '__mocks__',
      retainAllFiles: true,
    });

    const {fileSystem, hasteMap} = await fileMap.build();

    // Expect the node module to be part of files but make sure it wasn't
    // read.
    expect(
      fileSystem.linkStats(
        path.join('fruits', 'node_modules', 'fbjs', 'fbjs.js'),
      ),
    ).toEqual({fileType: 'f', modifiedTime: 32});

    expect(hasteMap.getModule('fbjs')).toBeNull();

    // 5 modules - the node_module
    expect(fs.readFileSync.mock.calls.length).toBe(5);
  });

  it('warns on duplicate mock files', async () => {
    expect.assertions(1);

    // Duplicate mock files for blueberry
    mockFs[
      path.join(
        '/',
        'project',
        'fruits1',
        '__mocks__',
        'subdir',
        'Blueberry.js',
      )
    ] = `
      // Blueberry
    `;
    mockFs[
      path.join(
        '/',
        'project',
        'fruits2',
        '__mocks__',
        'subdir',
        'Blueberry.js',
      )
    ] = `
      // Blueberry too!
    `;

    try {
      await new FileMap({
        mocksPattern: '__mocks__',
        throwOnModuleCollision: true,
        ...defaultConfig,
      }).build();
    } catch {
      expect(
        console.error.mock.calls[0][0].replaceAll('\\', '/'),
      ).toMatchSnapshot();
    }
  });

  it('warns on duplicate module ids', async () => {
    mockFs[path.join('/', 'project', 'fruits', 'other', 'Strawberry.js')] = `
      const Banana = require("Banana");
    `;

    const {hasteMap} = await new FileMap(defaultConfig).build();

    expect(() => hasteMap.getModule('Strawberry')).toThrow(
      DuplicateHasteCandidatesError,
    );

    expect(
      console.warn.mock.calls[0][0].replaceAll('\\', '/'),
    ).toMatchSnapshot();
  });

  it('throws on duplicate module ids if "throwOnModuleCollision" is set to true', async () => {
    expect.assertions(1);
    // Raspberry thinks it is a Strawberry
    mockFs[path.join('/', 'project', 'fruits', 'another', 'Strawberry.js')] = `
      const Banana = require("Banana");
    `;

    try {
      await new FileMap({
        throwOnModuleCollision: true,
        ...defaultConfig,
      }).build();
    } catch (err) {
      expect(err.message).toBe(
        'Duplicated files or mocks. Please check the console for more info',
      );
    }
  });

  it('splits up modules by platform', async () => {
    mockFs = Object.create(null);
    mockFs[path.join('/', 'project', 'fruits', 'Strawberry.js')] = `
      const Banana = require("Banana");
    `;

    mockFs[path.join('/', 'project', 'fruits', 'Strawberry.ios.js')] = `
      const Raspberry = require("Raspberry");
    `;

    mockFs[path.join('/', 'project', 'fruits', 'Strawberry.android.js')] = `
      const Blackberry = require("Blackberry");
    `;

    const {fileSystem, hasteMap} = await new FileMap(defaultConfig).build();

    assertFileSystemEqual(
      fileSystem,
      createMap({
        [path.join('fruits', 'Strawberry.android.js')]: [
          'Strawberry',
          32,
          42,
          1,
          'Blackberry',
          null,
          0,
        ],
        [path.join('fruits', 'Strawberry.ios.js')]: [
          'Strawberry',
          32,
          42,
          1,
          'Raspberry',
          null,
          0,
        ],
        [path.join('fruits', 'Strawberry.js')]: [
          'Strawberry',
          32,
          42,
          1,
          'Banana',
          null,
          0,
        ],
      }),
    );

    expect(hasteMap.getModule('Strawberry')).toEqual(
      path.join(defaultConfig.rootDir, 'fruits', 'Strawberry.js'),
    );

    expect(hasteMap.getModule('Strawberry', 'android')).toEqual(
      path.join(defaultConfig.rootDir, 'fruits', 'Strawberry.android.js'),
    );

    expect(hasteMap.getModule('Strawberry', 'ios')).toEqual(
      path.join(defaultConfig.rootDir, 'fruits', 'Strawberry.ios.js'),
    );
  });

  it('does not access the file system on a warm cache with no changes', async () => {
    await new FileMap(defaultConfig).build();
    const initialData = cacheContent;

    // First run should attempt to read the cache, but there will be no result
    expect(mockCacheManager.read).toHaveBeenCalledTimes(1);
    // and it should write a new cache
    expect(mockCacheManager.write).toHaveBeenCalledTimes(1);

    // The first run should access the file system five times for the regular
    // files in the system.
    expect(fs.readFileSync.mock.calls.length).toBe(5);

    fs.readFileSync.mockClear();

    // Explicitly mock that no files have changed.
    mockChangedFiles = Object.create(null);

    // Watchman would give us different clocks.
    mockClocks = createMap({
      fruits: 'c:fake-clock:3',
      vegetables: 'c:fake-clock:4',
    });

    await new FileMap(defaultConfig).build();
    const data = cacheContent;

    // Expect the cache to have been read again
    expect(mockCacheManager.read).toHaveBeenCalledTimes(2);
    // Expect no fs reads, because there have been no changes
    expect(fs.readFileSync.mock.calls.length).toBe(0);
    expect(deepNormalize(data.clocks)).toEqual(mockClocks);
    expect(serialize(data.fileSystem)).toEqual(
      serialize(initialData.fileSystem),
    );
  });

  it('only does minimal file system access when files change', async () => {
    // Run with a cold cache initially
    const {fileSystem: initialFileSystem} = await new FileMap(
      defaultConfig,
    ).build();

    expect(
      initialFileSystem.getDependencies(path.join('fruits', 'Banana.js')),
    ).toEqual(['Strawberry']);

    fs.readFileSync.mockClear();
    expect(mockCacheManager.read).toHaveBeenCalledTimes(1);

    // Let's assume one JS file has changed.
    mockChangedFiles = object({
      [path.join('/', 'project', 'fruits', 'Banana.js')]: `
            const Kiwi = require("Kiwi");
          `,
    });

    // Watchman would give us different clocks for `/project/fruits`.
    mockClocks = createMap({
      fruits: 'c:fake-clock:3',
      vegetables: 'c:fake-clock:2',
    });

    const {fileSystem} = await new FileMap(defaultConfig).build();
    const data = cacheContent;

    expect(mockCacheManager.read).toHaveBeenCalledTimes(2);
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync).toBeCalledWith(
      path.join('/', 'project', 'fruits', 'Banana.js'),
    );

    expect(deepNormalize(data.clocks)).toEqual(mockClocks);

    expect(
      fileSystem.getDependencies(path.join('fruits', 'Banana.js')),
    ).toEqual(['Kiwi']);
  });

  it('correctly handles file deletions', async () => {
    await new FileMap(defaultConfig).build();
    fs.readFileSync.mockClear();

    // Let's assume one JS file was removed.
    delete mockFs[path.join('/', 'project', 'fruits', 'Banana.js')];
    mockChangedFiles = object({
      [path.join('/', 'project', 'fruits', 'Banana.js')]: null,
    });

    // Watchman would give us different clocks for `/project/fruits`.
    mockClocks = createMap({
      fruits: 'c:fake-clock:3',
      vegetables: 'c:fake-clock:2',
    });
    const {fileSystem, hasteMap} = await new FileMap(defaultConfig).build();

    expect(fileSystem.exists(path.join('fruits', 'Banana.js'))).toEqual(false);
    expect(hasteMap.getModule('Banana')).toBeNull();
  });

  it('correctly handles platform-specific file additions', async () => {
    mockFs = Object.create(null);
    // Begin with only a generic implementation.
    mockFs[path.join('/', 'project', 'fruits', 'Strawberry.js')] = `
      const Banana = require("Banana");
    `;
    const {hasteMap: firstHasteMap} = await new FileMap(defaultConfig).build();
    // Generic and ios return the generic implementation.
    expect(firstHasteMap.getModule('Strawberry')).toEqual(
      path.join(defaultConfig.rootDir, 'fruits', 'Strawberry.js'),
    );
    expect(firstHasteMap.getModule('Strawberry', 'ios')).toEqual(
      path.join(defaultConfig.rootDir, 'fruits', 'Strawberry.js'),
    );

    // Add an ios implementation
    mockChangedFiles = object({
      [path.join('/', 'project', 'fruits', 'Strawberry.ios.js')]: `
        const Raspberry = require("Raspberry");
      `,
    });
    mockClocks = createMap({fruits: 'c:fake-clock:3'});
    const {hasteMap: secondHasteMap} = await new FileMap(defaultConfig).build();
    expect(secondHasteMap.getModule('Strawberry')).toEqual(
      path.join(defaultConfig.rootDir, 'fruits', 'Strawberry.js'),
    );
    // ios now has a specific implementation.
    expect(secondHasteMap.getModule('Strawberry', 'ios')).toEqual(
      path.join(defaultConfig.rootDir, 'fruits', 'Strawberry.ios.js'),
    );
  });

  it('correctly handles platform-specific file deletions', async () => {
    mockFs = Object.create(null);
    // Begin with generic and ios implementations.
    mockFs[path.join('/', 'project', 'fruits', 'Strawberry.js')] = `
      const Banana = require("Banana");
    `;
    mockFs[path.join('/', 'project', 'fruits', 'Strawberry.ios.js')] = `
      const Raspberry = require("Raspberry");
    `;
    const {hasteMap: firstHasteMap} = await new FileMap(defaultConfig).build();
    expect(firstHasteMap.getModule('Strawberry', 'ios')).toEqual(
      path.join(defaultConfig.rootDir, 'fruits', 'Strawberry.ios.js'),
    );
    expect(firstHasteMap.getModule('Strawberry')).toEqual(
      path.join(defaultConfig.rootDir, 'fruits', 'Strawberry.js'),
    );

    // Delete the ios implementation.
    delete mockFs[path.join('/', 'project', 'fruits', 'Strawberry.ios.js')];
    mockChangedFiles = object({
      [path.join('/', 'project', 'fruits', 'Strawberry.ios.js')]: null,
    });
    mockClocks = createMap({fruits: 'c:fake-clock:3'});
    const {hasteMap: secondHasteMap} = await new FileMap(defaultConfig).build();

    // Expect both ios and generic return generic.
    expect(secondHasteMap.getModule('Strawberry', 'ios')).toEqual(
      path.join(defaultConfig.rootDir, 'fruits', 'Strawberry.js'),
    );
    expect(secondHasteMap.getModule('Strawberry')).toEqual(
      path.join(defaultConfig.rootDir, 'fruits', 'Strawberry.js'),
    );

    // Delete the generic implementation.
    delete mockFs[path.join('/', 'project', 'fruits', 'Strawberry.js')];
    mockChangedFiles = object({
      [path.join('/', 'project', 'fruits', 'Strawberry.js')]: null,
    });
    mockClocks = createMap({fruits: 'c:fake-clock:4'});
    const {hasteMap: thirdHasteMap} = await new FileMap(defaultConfig).build();

    // No implementation of Strawberry remains.
    expect(thirdHasteMap.getModule('Strawberry', 'ios')).toBeNull();
    expect(thirdHasteMap.getModule('Strawberry')).toBeNull();
  });

  it('correctly handles platform-specific file renames', async () => {
    mockFs = Object.create(null);
    mockFs[path.join('/', 'project', 'fruits', 'Strawberry.ios.js')] = `
      const Raspberry = require("Raspberry");
    `;
    const {hasteMap: firstHasteMap} = await new FileMap(defaultConfig).build();
    expect(firstHasteMap.getModule('Strawberry', 'ios')).toEqual(
      path.join(defaultConfig.rootDir, 'fruits', 'Strawberry.ios.js'),
    );
    expect(firstHasteMap.getModule('Strawberry')).toBeNull();

    // Rename Strawberry.ios.js -> Strawberry.js to make it generic
    delete mockFs[path.join('/', 'project', 'fruits', 'Strawberry.ios.js')];
    mockChangedFiles = object({
      [path.join('/', 'project', 'fruits', 'Strawberry.ios.js')]: null,
      [path.join('/', 'project', 'fruits', 'Strawberry.js')]: `
        const Banana = require("Banana");
      `,
    });
    mockClocks = createMap({fruits: 'c:fake-clock:3'});
    const {hasteMap: secondHasteMap} = await new FileMap(defaultConfig).build();
    expect(secondHasteMap.getModule('Strawberry')).toEqual(
      path.join(defaultConfig.rootDir, 'fruits', 'Strawberry.js'),
    );
    // Fall back to generic implementation
    expect(secondHasteMap.getModule('Strawberry', 'ios')).toEqual(
      path.join(defaultConfig.rootDir, 'fruits', 'Strawberry.js'),
    );
  });

  describe('duplicate modules', () => {
    beforeEach(async () => {
      mockFs[path.join('/', 'project', 'fruits', 'another', 'Strawberry.js')] =
        `
        const Blackberry = require("Blackberry");
      `;

      mockFs[path.join('/', 'project', 'fruits', 'Banana.ios.js')] = '//';
      mockFs[path.join('/', 'project', 'fruits', 'another', 'Banana.ios.js')] =
        '//';

      const {hasteMap} = await new FileMap(defaultConfig).build();
      expect(() => hasteMap.getModule('Strawberry')).toThrow(
        new DuplicateHasteCandidatesError(
          'Strawberry',
          H.GENERIC_PLATFORM,
          false,
          new Set([
            [
              path.join(defaultConfig.rootDir, 'fruits', 'Strawberry.js'),
              H.MODULE,
            ],
            [
              path.join(
                defaultConfig.rootDir,
                'fruits',
                'another',
                'Strawberry.js',
              ),
              H.MODULE,
            ],
          ]),
        ),
      );
      expect(hasteMap.getModule('Banana')).toBeDefined();
      expect(() => hasteMap.getModule('Banana', 'ios')).toThrow(
        new DuplicateHasteCandidatesError(
          'Banana',
          'ios',
          false,
          new Set([
            [
              path.join(defaultConfig.rootDir, 'fruits', 'Banana.ios.js'),
              H.MODULE,
            ],
            [
              path.join(
                defaultConfig.rootDir,
                'fruits',
                'another',
                'Banana.ios.js',
              ),
              H.MODULE,
            ],
          ]),
        ),
      );
    });

    it('recovers when a duplicate file is deleted', async () => {
      delete mockFs[
        path.join('/', 'project', 'fruits', 'another', 'Strawberry.js')
      ];
      mockChangedFiles = object({
        [path.join('/', 'project', 'fruits', 'another', 'Strawberry.js')]: null,
      });
      mockClocks = createMap({
        fruits: 'c:fake-clock:3',
        vegetables: 'c:fake-clock:2',
      });

      const {hasteMap} = await new FileMap(defaultConfig).build();

      expect(hasteMap.getModule('Strawberry')).toEqual(
        path.join(defaultConfig.rootDir, 'fruits', 'Strawberry.js'),
      );

      expect(hasteMap.getModule('Banana')).toEqual(
        path.join(defaultConfig.rootDir, 'fruits', 'Banana.js'),
      );
    });

    it('recovers when a duplicate platform-specific file is deleted', async () => {
      delete mockFs[
        path.join('/', 'project', 'fruits', 'another', 'Banana.ios.js')
      ];
      mockChangedFiles = object({
        [path.join('/', 'project', 'fruits', 'another', 'Banana.ios.js')]: null,
      });
      mockClocks = createMap({
        fruits: 'c:fake-clock:3',
        vegetables: 'c:fake-clock:2',
      });

      const {hasteMap} = await new FileMap(defaultConfig).build();
      expect(hasteMap.getModule('Banana')).toEqual(
        path.join(defaultConfig.rootDir, 'fruits', 'Banana.js'),
      );
      expect(hasteMap.getModule('Banana', 'ios')).toEqual(
        path.join(defaultConfig.rootDir, 'fruits', 'Banana.ios.js'),
      );
      expect(hasteMap.getModule('Melon')).toEqual(
        path.join(defaultConfig.rootDir, 'vegetables', 'Melon.js'),
      );
    });

    it('recovers with the correct type when a duplicate file is deleted', async () => {
      mockFs[
        path.join('/', 'project', 'fruits', 'strawberryPackage', 'package.json')
      ] = `
        {"name": "Strawberry"}
      `;

      const {hasteMap: initialHasteMap} = await new FileMap(
        defaultConfig,
      ).build();

      let initialStrawberryError;
      try {
        initialHasteMap.getModule('Strawberry');
      } catch (e) {
        initialStrawberryError = e;
      }

      expect(initialStrawberryError).toBeInstanceOf(
        DuplicateHasteCandidatesError,
      );
      expect(initialStrawberryError.duplicatesSet).toEqual(
        new Map([
          [
            path.join(defaultConfig.rootDir, 'fruits', 'Strawberry.js'),
            H.MODULE,
          ],
          [
            path.join(
              defaultConfig.rootDir,
              'fruits',
              'another',
              'Strawberry.js',
            ),
            H.MODULE,
          ],
          [
            path.join(
              defaultConfig.rootDir,
              'fruits',
              'strawberryPackage',
              'package.json',
            ),
            H.PACKAGE,
          ],
        ]),
      );

      delete mockFs[
        path.join('/', 'project', 'fruits', 'another', 'Strawberry.js')
      ];
      delete mockFs[
        path.join('/', 'project', 'fruits', 'strawberryPackage', 'package.json')
      ];

      mockChangedFiles = object({
        [path.join('/', 'project', 'fruits', 'another', 'Strawberry.js')]: null,
        [path.join(
          '/',
          'project',
          'fruits',
          'strawberryPackage',
          'package.json',
        )]: null,
      });
      mockClocks = createMap({
        fruits: 'c:fake-clock:4',
      });

      const {hasteMap: newHasteMap} = await new FileMap(defaultConfig).build();

      expect(newHasteMap.getModule('Strawberry')).toEqual(
        path.join(defaultConfig.rootDir, 'fruits', 'Strawberry.js'),
      );
    });

    it('recovers when a duplicate module is renamed', async () => {
      mockChangedFiles = object({
        [path.join('/', 'project', 'fruits', 'another', 'Pineapple.js')]: `
          const Blackberry = require("Blackberry");
        `,
        [path.join('/', 'project', 'fruits', 'another', 'Strawberry.js')]: null,
      });
      mockClocks = createMap({
        fruits: 'c:fake-clock:3',
        vegetables: 'c:fake-clock:2',
      });

      const {hasteMap} = await new FileMap(defaultConfig).build();
      expect(hasteMap.getModule('Strawberry')).toEqual(
        path.join(defaultConfig.rootDir, 'fruits', 'Strawberry.js'),
      );
      expect(hasteMap.getModule('Pineapple')).toEqual(
        path.join(defaultConfig.rootDir, 'fruits', 'another', 'Pineapple.js'),
      );
      expect(hasteMap.getModule('Banana')).toEqual(
        path.join(defaultConfig.rootDir, 'fruits', 'Banana.js'),
      );
    });
  });

  it('ignores files that do not exist', async () => {
    const watchman = require('../crawlers/watchman');
    const mockImpl = watchman.getMockImplementation();
    // Wrap the watchman mock and add an invalid file to the file list.
    const invalidFilePath = path.join('fruits', 'invalid', 'file.js');
    watchman.mockImplementation(async options => {
      const {changedFiles} = await mockImpl(options);
      changedFiles.set(invalidFilePath, ['', 34, 44, 0, [], null, 0]);
      return {
        changedFiles,
        removedFiles: new Set(),
      };
    });

    const {fileSystem} = await new FileMap(defaultConfig).build();
    expect(fileSystem.getDifference(new Map()).removedFiles.size).toBe(5);

    // Ensure this file is not part of the file list.
    expect(fileSystem.exists(invalidFilePath)).toBe(false);
  });

  it('distributes work across workers', async () => {
    const jestWorker = require('jest-worker').Worker;
    const path = require('path');
    const dependencyExtractor = path.join(__dirname, 'dependencyExtractor.js');
    await new FileMap({
      ...defaultConfig,
      dependencyExtractor,
      hasteImplModulePath: undefined,
      maxWorkers: 4,
    }).build();

    expect(jestWorker.mock.calls.length).toBe(1);

    expect(mockWorker.mock.calls.length).toBe(5);

    expect(mockWorker.mock.calls).toEqual([
      [
        {
          computeDependencies: true,
          computeSha1: false,
          dependencyExtractor,
          enableHastePackages: true,
          filePath: path.join('/', 'project', 'fruits', 'Banana.js'),
          hasteImplModulePath: undefined,
          readLink: false,
          rootDir: path.join('/', 'project'),
        },
      ],
      [
        {
          computeDependencies: true,
          computeSha1: false,
          dependencyExtractor,
          enableHastePackages: true,
          filePath: path.join('/', 'project', 'fruits', 'Pear.js'),
          hasteImplModulePath: undefined,
          readLink: false,
          rootDir: path.join('/', 'project'),
        },
      ],
      [
        {
          computeDependencies: true,
          computeSha1: false,
          dependencyExtractor,
          enableHastePackages: true,
          filePath: path.join('/', 'project', 'fruits', 'Strawberry.js'),
          hasteImplModulePath: undefined,
          readLink: false,
          rootDir: path.join('/', 'project'),
        },
      ],
      [
        {
          computeDependencies: true,
          computeSha1: false,
          dependencyExtractor,
          enableHastePackages: true,
          filePath: path.join('/', 'project', 'fruits', '__mocks__', 'Pear.js'),
          hasteImplModulePath: undefined,
          readLink: false,
          rootDir: path.join('/', 'project'),
        },
      ],
      [
        {
          computeDependencies: true,
          computeSha1: false,
          dependencyExtractor,
          enableHastePackages: true,
          filePath: path.join('/', 'project', 'vegetables', 'Melon.js'),
          hasteImplModulePath: undefined,
          readLink: false,
          rootDir: path.join('/', 'project'),
        },
      ],
    ]);

    expect(mockEnd).toBeCalled();
  });

  it('tries to crawl using node as a fallback', async () => {
    const watchman = require('../crawlers/watchman');
    const node = require('../crawlers/node');

    watchman.mockImplementation(() => {
      throw new Error('watchman error');
    });
    node.mockImplementation(options => {
      return Promise.resolve({
        changedFiles: createMap({
          [path.join('fruits', 'Banana.js')]: ['', 32, 42, 0, '', null, 0],
        }),
        removedFiles: new Set(),
      });
    });

    const {fileSystem} = await new FileMap(defaultConfig).build();

    expect(watchman).toBeCalled();
    expect(node).toBeCalled();

    assertFileSystemEqual(
      fileSystem,
      createMap({
        [path.join('fruits', 'Banana.js')]: [
          'Banana',
          32,
          42,
          1,
          'Strawberry',
          null,
          0,
        ],
      }),
    );

    expect(console.warn.mock.calls[0][0]).toMatchSnapshot();
  });

  it('tries to crawl using node as a fallback when promise fails once', async () => {
    const watchman = require('../crawlers/watchman');
    const node = require('../crawlers/node');

    watchman.mockImplementation(() =>
      Promise.reject(new Error('watchman error')),
    );
    node.mockImplementation(options => {
      return Promise.resolve({
        changedFiles: createMap({
          [path.join('fruits', 'Banana.js')]: ['', 32, 42, 0, '', null, 0],
        }),
        removedFiles: new Set(),
      });
    });

    const {fileSystem} = await new FileMap(defaultConfig).build();

    expect(watchman).toBeCalled();
    expect(node).toBeCalled();

    assertFileSystemEqual(
      fileSystem,
      createMap({
        [path.join('fruits', 'Banana.js')]: [
          'Banana',
          32,
          42,
          1,
          'Strawberry',
          null,
          0,
        ],
      }),
    );
  });

  it('stops crawling when both crawlers fail', async () => {
    expect.assertions(1);
    const watchman = require('../crawlers/watchman');
    const node = require('../crawlers/node');

    watchman.mockImplementation(() =>
      Promise.reject(new Error('watchman error')),
    );

    node.mockImplementation((roots, extensions, ignore, data) =>
      Promise.reject(new Error('node error')),
    );

    try {
      await new FileMap(defaultConfig).build();
    } catch (error) {
      expect(error.message).toEqual(
        'Crawler retry failed:\n' +
          '  Original error: watchman error\n' +
          '  Retry error: node error\n',
      );
    }
  });

  describe('file system changes processing', () => {
    function waitForItToChange(fileMap) {
      return new Promise(resolve => {
        fileMap.once('change', resolve);
      });
    }

    function mockDeleteFile(dirPath, filePath) {
      const e = mockEmitters[dirPath];
      e.emit('all', 'delete', filePath, dirPath, undefined);
    }

    function fm_it(title, fn, options) {
      options = options || {};
      (options.only ? it.only : it)(title, async () => {
        if (options.mockFs) {
          mockFs = options.mockFs;
        }
        const config = {
          ...defaultConfig,
          watch: true,
          ...options.config,
        };
        const hm = new FileMap(config);
        await hm.build();
        try {
          await fn(hm);
        } finally {
          hm.end();
        }
      });
    }

    fm_it.only = (title, fn, options) =>
      fm_it(title, fn, {...options, only: true});

    fm_it('build returns a "live" fileSystem and hasteMap', async hm => {
      const {fileSystem, hasteMap} = await hm.build();
      const filePath = path.join('/', 'project', 'fruits', 'Banana.js');
      expect(fileSystem.getModuleName(filePath)).toBeDefined();
      expect(hasteMap.getModule('Banana')).toBe(filePath);
      mockDeleteFile(path.join('/', 'project', 'fruits'), 'Banana.js');
      mockDeleteFile(path.join('/', 'project', 'fruits'), 'Banana.js');
      const {eventsQueue} = await waitForItToChange(hm);
      expect(eventsQueue).toHaveLength(1);
      const deletedBanana = {
        filePath,
        metadata: {
          modifiedTime: null,
          size: null,
          type: 'f',
        },
        type: 'delete',
      };
      expect(eventsQueue).toEqual([deletedBanana]);
      // Verify that the initial result has been updated
      expect(fileSystem.getModuleName(filePath)).toBeNull();
      expect(hasteMap.getModule('Banana')).toBeNull();
    });

    const MOCK_CHANGE_FILE = {
      type: 'f',
      modifiedTime: 45,
      size: 55,
    };

    const MOCK_DELETE_FILE = {
      type: 'f',
      modifiedTime: null,
      size: null,
    };

    const MOCK_CHANGE_LINK = {
      type: 'l',
      modifiedTime: 46,
      size: 5,
    };

    const MOCK_DELETE_LINK = {
      type: 'l',
      modifiedTime: null,
      size: null,
    };

    const MOCK_CHANGE_FOLDER = {
      type: 'd',
      modifiedTime: 45,
      size: 55,
    };

    fm_it('handles several change events at once', async hm => {
      const {fileSystem, hasteMap} = await hm.build();
      mockFs[path.join('/', 'project', 'fruits', 'Tomato.js')] = `
        // Tomato!
      `;
      mockFs[path.join('/', 'project', 'fruits', 'Pear.js')] = `
        // Pear!
      `;
      const e = mockEmitters[path.join('/', 'project', 'fruits')];
      e.emit(
        'all',
        'add',
        'Tomato.js',
        path.join('/', 'project', 'fruits'),
        MOCK_CHANGE_FILE,
      );
      e.emit(
        'all',
        'change',
        'Pear.js',
        path.join('/', 'project', 'fruits'),
        MOCK_CHANGE_FILE,
      );
      const {eventsQueue} = await waitForItToChange(hm);
      expect(eventsQueue).toEqual([
        {
          filePath: path.join('/', 'project', 'fruits', 'Tomato.js'),
          metadata: MOCK_CHANGE_FILE,
          type: 'add',
        },
        {
          filePath: path.join('/', 'project', 'fruits', 'Pear.js'),
          metadata: MOCK_CHANGE_FILE,
          type: 'change',
        },
      ]);
      expect(
        fileSystem.getModuleName(
          path.join('/', 'project', 'fruits', 'Tomato.js'),
        ),
      ).not.toBeNull();
      expect(hasteMap.getModule('Tomato')).toBeDefined();
      expect(hasteMap.getModule('Pear')).toBe(
        path.join('/', 'project', 'fruits', 'Pear.js'),
      );
    });

    fm_it('does not emit duplicate change events', async hm => {
      const e = mockEmitters[path.join('/', 'project', 'fruits')];
      mockFs[path.join('/', 'project', 'fruits', 'Tomato.js')] = `
        // Tomato!
      `;
      e.emit(
        'all',
        'change',
        'Tomato.js',
        path.join('/', 'project', 'fruits'),
        MOCK_CHANGE_FILE,
      );
      e.emit(
        'all',
        'change',
        'Tomato.js',
        path.join('/', 'project', 'fruits'),
        MOCK_CHANGE_FILE,
      );
      const {eventsQueue} = await waitForItToChange(hm);
      expect(eventsQueue).toHaveLength(1);
    });

    fm_it(
      'suppresses backend symlink events if enableSymlinks: false',
      async hm => {
        const {fileSystem} = await hm.build();
        const fruitsRoot = path.join('/', 'project', 'fruits');
        const e = mockEmitters[fruitsRoot];
        mockFs[path.join(fruitsRoot, 'Tomato.js')] = `
        // Tomato!
      `;
        e.emit('all', 'change', 'Tomato.js', fruitsRoot, MOCK_CHANGE_FILE);
        e.emit(
          'all',
          'change',
          'LinkToStrawberry.js',
          fruitsRoot,
          MOCK_CHANGE_LINK,
        );
        const {eventsQueue} = await waitForItToChange(hm);
        expect(eventsQueue).toEqual([
          {
            filePath: path.join(fruitsRoot, 'Tomato.js'),
            metadata: MOCK_CHANGE_FILE,
            type: 'change',
          },
        ]);
        expect(
          fileSystem.linkStats(path.join(fruitsRoot, 'LinkToStrawberry.js')),
        ).toBeNull();
      },
    );

    fm_it(
      'emits symlink events if enableSymlinks: true',
      async hm => {
        const {fileSystem} = await hm.build();
        const fruitsRoot = path.join('/', 'project', 'fruits');
        const e = mockEmitters[fruitsRoot];
        mockFs[path.join(fruitsRoot, 'Tomato.js')] = `
        // Tomato!
      `;
        e.emit('all', 'change', 'Tomato.js', fruitsRoot, MOCK_CHANGE_FILE);
        e.emit(
          'all',
          'change',
          'LinkToStrawberry.js',
          fruitsRoot,
          MOCK_CHANGE_LINK,
        );
        const {eventsQueue} = await waitForItToChange(hm);
        expect(eventsQueue).toEqual([
          {
            filePath: path.join(fruitsRoot, 'Tomato.js'),
            metadata: MOCK_CHANGE_FILE,
            type: 'change',
          },
          {
            filePath: path.join(fruitsRoot, 'LinkToStrawberry.js'),
            metadata: MOCK_CHANGE_LINK,
            type: 'change',
          },
        ]);
        expect(
          fileSystem.linkStats(path.join(fruitsRoot, 'LinkToStrawberry.js')),
        ).toEqual({fileType: 'l', modifiedTime: 46});
      },
      {config: {enableSymlinks: true}},
    );

    fm_it(
      'emits a change even if a file in node_modules has changed',
      async hm => {
        const {fileSystem} = await hm.build();
        const e = mockEmitters[path.join('/', 'project', 'fruits')];
        e.emit(
          'all',
          'add',
          'apple.js',
          path.join('/', 'project', 'fruits', 'node_modules', ''),
          MOCK_CHANGE_FILE,
        );
        const {eventsQueue} = await waitForItToChange(hm);
        const filePath = path.join(
          '/',
          'project',
          'fruits',
          'node_modules',
          'apple.js',
        );
        expect(eventsQueue).toHaveLength(1);
        expect(eventsQueue).toEqual([
          {filePath, metadata: MOCK_CHANGE_FILE, type: 'add'},
        ]);
        expect(fileSystem.getModuleName(filePath)).toBeDefined();
      },
    );

    fm_it(
      'does not emit changes for regular files with unwatched extensions',
      async hm => {
        const {fileSystem} = await hm.build();
        mockFs[path.join('/', 'project', 'fruits', 'Banana.unwatched')] = '';

        const e = mockEmitters[path.join('/', 'project', 'fruits')];
        e.emit(
          'all',
          'add',
          path.join('Banana.js'),
          path.join('/', 'project', 'fruits', ''),
          MOCK_CHANGE_FILE,
        );
        e.emit(
          'all',
          'add',
          path.join('Banana.unwatched'),
          path.join('/', 'project', 'fruits', ''),
          MOCK_CHANGE_FILE,
        );
        const {eventsQueue} = await waitForItToChange(hm);
        const filePath = path.join('/', 'project', 'fruits', 'Banana.js');
        expect(eventsQueue).toHaveLength(1);
        expect(eventsQueue).toEqual([
          {filePath, metadata: MOCK_CHANGE_FILE, type: 'add'},
        ]);
        expect(fileSystem.getModuleName(filePath)).toBeDefined();
      },
    );

    fm_it('does not emit delete events for unknown files', async hm => {
      const {fileSystem} = await hm.build();
      mockFs[path.join('/', 'project', 'fruits', 'Banana.unwatched')] = '';

      const e = mockEmitters[path.join('/', 'project', 'fruits')];
      e.emit(
        'all',
        'delete',
        path.join('Banana.js'),
        path.join('/', 'project', 'fruits', ''),
        null,
      );
      e.emit(
        'all',
        'delete',
        path.join('Unknown.ext'),
        path.join('/', 'project', 'fruits', ''),
        null,
      );
      const {eventsQueue} = await waitForItToChange(hm);
      const filePath = path.join('/', 'project', 'fruits', 'Banana.js');
      expect(eventsQueue).toHaveLength(1);
      expect(eventsQueue).toEqual([
        {filePath, metadata: MOCK_DELETE_FILE, type: 'delete'},
      ]);
      expect(fileSystem.getModuleName(filePath)).toBeDefined();
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });

    fm_it(
      'does emit changes for symlinks with unlisted extensions',
      async hm => {
        const {fileSystem} = await hm.build();
        const e = mockEmitters[path.join('/', 'project', 'fruits')];
        mockFs[path.join('/', 'project', 'fruits', 'LinkToStrawberry.ext')] = {
          link: 'Strawberry.js',
        };
        e.emit(
          'all',
          'add',
          path.join('LinkToStrawberry.ext'),
          path.join('/', 'project', 'fruits', ''),
          MOCK_CHANGE_LINK,
        );
        const {eventsQueue} = await waitForItToChange(hm);
        const filePath = path.join(
          '/',
          'project',
          'fruits',
          'LinkToStrawberry.ext',
        );
        expect(eventsQueue).toHaveLength(1);
        expect(eventsQueue).toEqual([
          {filePath, metadata: MOCK_CHANGE_LINK, type: 'add'},
        ]);
        const linkStats = fileSystem.linkStats(filePath);
        expect(linkStats).toEqual({
          fileType: 'l',
          modifiedTime: 46,
        });
        // getModuleName traverses the symlink, verifying the link is read.
        expect(fileSystem.getModuleName(filePath)).toEqual('Strawberry');
      },
      {config: {enableSymlinks: true}},
    );

    fm_it(
      'symlink deletion is handled without affecting the symlink target',
      async hm => {
        const {fileSystem, hasteMap} = await hm.build();

        const symlinkPath = path.join(
          '/',
          'project',
          'fruits',
          'LinkToStrawberry.js',
        );
        const realPath = path.join('/', 'project', 'fruits', 'Strawberry.js');

        expect(fileSystem.getModuleName(symlinkPath)).toEqual('Strawberry');
        expect(fileSystem.getModuleName(realPath)).toEqual('Strawberry');
        expect(hasteMap.getModule('Strawberry', 'g')).toEqual(realPath);

        // Delete the symlink
        const e = mockEmitters[path.join('/', 'project', 'fruits')];
        delete mockFs[symlinkPath];
        e.emit(
          'all',
          'delete',
          'LinkToStrawberry.js',
          path.join('/', 'project', 'fruits', ''),
          null,
        );
        const {eventsQueue} = await waitForItToChange(hm);

        expect(eventsQueue).toHaveLength(1);
        expect(eventsQueue).toEqual([
          {filePath: symlinkPath, metadata: MOCK_DELETE_LINK, type: 'delete'},
        ]);

        // Symlink is deleted without affecting the Haste module or real file.
        expect(fileSystem.exists(symlinkPath)).toBe(false);
        expect(fileSystem.exists(realPath)).toBe(true);
        expect(fileSystem.getModuleName(symlinkPath)).toEqual(null);
        expect(fileSystem.getModuleName(realPath)).toEqual('Strawberry');
        expect(hasteMap.getModule('Strawberry', 'g')).toEqual(realPath);
      },
      {config: {enableSymlinks: true}},
    );

    fm_it(
      'correctly tracks changes to both platform-specific versions of a single module name',
      async hm => {
        const {hasteMap, fileSystem} = await hm.build();
        expect(hasteMap.getModule('Orange', 'ios')).toBeTruthy();
        expect(hasteMap.getModule('Orange', 'android')).toBeTruthy();
        const e = mockEmitters[path.join('/', 'project', 'fruits')];
        e.emit(
          'all',
          'change',
          'Orange.ios.js',
          path.join('/', 'project', 'fruits'),
          MOCK_CHANGE_FILE,
        );
        e.emit(
          'all',
          'change',
          'Orange.android.js',
          path.join('/', 'project', 'fruits'),
          MOCK_CHANGE_FILE,
        );
        const {eventsQueue} = await waitForItToChange(hm);
        expect(eventsQueue).toHaveLength(2);
        expect(eventsQueue).toEqual([
          {
            filePath: path.join('/', 'project', 'fruits', 'Orange.ios.js'),
            metadata: MOCK_CHANGE_FILE,
            type: 'change',
          },
          {
            filePath: path.join('/', 'project', 'fruits', 'Orange.android.js'),
            metadata: MOCK_CHANGE_FILE,
            type: 'change',
          },
        ]);
        expect(
          fileSystem.getModuleName(
            path.join('/', 'project', 'fruits', 'Orange.ios.js'),
          ),
        ).toBeTruthy();
        expect(
          fileSystem.getModuleName(
            path.join('/', 'project', 'fruits', 'Orange.android.js'),
          ),
        ).toBeTruthy();
        const iosVariant = hasteMap.getModule('Orange', 'ios');
        expect(iosVariant).toBe(
          path.join('/', 'project', 'fruits', 'Orange.ios.js'),
        );
        const androidVariant = hasteMap.getModule('Orange', 'android');
        expect(androidVariant).toBe(
          path.join('/', 'project', 'fruits', 'Orange.android.js'),
        );
      },
      {
        mockFs: {
          [path.join('/', 'project', 'fruits', 'Orange.android.js')]: `
            // Orange Android!
          `,
          [path.join('/', 'project', 'fruits', 'Orange.ios.js')]: `
            // Orange iOS!
          `,
        },
      },
    );

    fm_it('correctly handles moving a Haste module', async hm => {
      const oldPath = path.join('/', 'project', 'vegetables', 'Melon.js');
      const newPath = path.join('/', 'project', 'fruits', 'Melon.js');

      const {hasteMap} = await hm.build();
      expect(hasteMap.getModule('Melon')).toEqual(oldPath);

      // Move vegetables/Melon.js -> fruits/Melon.js
      mockFs[newPath] = mockFs[oldPath];
      mockFs[oldPath] = null;

      mockEmitters[path.join('/', 'project', 'vegetables')].emit(
        'all',
        'delete',
        'Melon.js',
        path.join('/', 'project', 'vegetables'),
        null,
      );
      mockEmitters[path.join('/', 'project', 'fruits')].emit(
        'all',
        'add',
        'Melon.js',
        path.join('/', 'project', 'fruits'),
        MOCK_CHANGE_FILE,
      );

      const {eventsQueue} = await waitForItToChange(hm);

      // No duplicate warnings or errors should be printed.
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();

      expect(eventsQueue).toHaveLength(2);
      expect(eventsQueue).toEqual([
        {
          filePath: path.join('/', 'project', 'vegetables', 'Melon.js'),
          metadata: MOCK_DELETE_FILE,
          type: 'delete',
        },
        {
          filePath: path.join('/', 'project', 'fruits', 'Melon.js'),
          metadata: MOCK_CHANGE_FILE,
          type: 'add',
        },
      ]);
      expect(hasteMap.getModule('Melon')).toEqual(newPath);
    });

    describe('recovery from duplicate module IDs', () => {
      async function setupDuplicates(hm) {
        const {fileSystem, hasteMap} = await hm.build();
        mockFs[path.join('/', 'project', 'fruits', 'Pear.js')] = `
          // Pear!
        `;
        mockFs[path.join('/', 'project', 'fruits', 'another', 'Pear.js')] = `
          // Pear too!
        `;
        const e = mockEmitters[path.join('/', 'project', 'fruits')];
        e.emit(
          'all',
          'change',
          'Pear.js',
          path.join('/', 'project', 'fruits'),
          MOCK_CHANGE_FILE,
        );
        e.emit(
          'all',
          'add',
          'Pear.js',
          path.join('/', 'project', 'fruits', 'another'),
          MOCK_CHANGE_FILE,
        );
        await waitForItToChange(hm);
        expect(
          fileSystem.exists(
            path.join('/', 'project', 'fruits', 'another', 'Pear.js'),
          ),
        ).toBe(true);
        try {
          hasteMap.getModule('Pear');
          throw new Error('should be unreachable');
        } catch (error) {
          expect(error).toBeInstanceOf(DuplicateHasteCandidatesError);
          expect(error.hasteName).toBe('Pear');
          expect(error.platform).toBe('g');
          expect(error.supportsNativePlatform).toBe(false);
          expect(error.duplicatesSet).toEqual(
            createMap({
              [path.join('/', 'project', 'fruits', 'Pear.js')]: H.MODULE,
              [path.join('/', 'project', 'fruits', 'another', 'Pear.js')]:
                H.MODULE,
            }),
          );
          expect(error.message.replaceAll('\\', '/')).toMatchSnapshot();
        }
      }

      fm_it(
        'recovers when the oldest version of the duplicates is fixed',
        async hm => {
          const {hasteMap} = await hm.build();
          await setupDuplicates(hm);
          mockFs[path.join('/', 'project', 'fruits', 'Pear.js')] = null;
          mockFs[path.join('/', 'project', 'fruits', 'Pear2.js')] = `
            // Pear!
          `;
          const e = mockEmitters[path.join('/', 'project', 'fruits')];
          e.emit(
            'all',
            'delete',
            'Pear.js',
            path.join('/', 'project', 'fruits'),
            MOCK_CHANGE_FILE,
          );
          e.emit(
            'all',
            'add',
            'Pear2.js',
            path.join('/', 'project', 'fruits'),
            MOCK_CHANGE_FILE,
          );
          await waitForItToChange(hm);
          expect(hasteMap.getModule('Pear')).toBe(
            path.join('/', 'project', 'fruits', 'another', 'Pear.js'),
          );
          expect(hasteMap.getModule('Pear2')).toBe(
            path.join('/', 'project', 'fruits', 'Pear2.js'),
          );
        },
      );

      fm_it('recovers when the most recent duplicate is fixed', async hm => {
        const {hasteMap} = await hm.build();
        await setupDuplicates(hm);
        mockFs[path.join('/', 'project', 'fruits', 'another', 'Pear.js')] =
          null;
        mockFs[path.join('/', 'project', 'fruits', 'another', 'Pear2.js')] = `
          // Pear too!
        `;
        const e = mockEmitters[path.join('/', 'project', 'fruits')];
        e.emit(
          'all',
          'add',
          'Pear2.js',
          path.join('/', 'project', 'fruits', 'another'),
          MOCK_CHANGE_FILE,
        );
        e.emit(
          'all',
          'delete',
          'Pear.js',
          path.join('/', 'project', 'fruits', 'another'),
          MOCK_CHANGE_FILE,
        );
        await waitForItToChange(hm);
        expect(hasteMap.getModule('Pear')).toBe(
          path.join('/', 'project', 'fruits', 'Pear.js'),
        );
        expect(hasteMap.getModule('Pear2')).toBe(
          path.join('/', 'project', 'fruits', 'another', 'Pear2.js'),
        );
      });

      fm_it('ignore directory events (even with file-ish names)', async hm => {
        const e = mockEmitters[path.join('/', 'project', 'fruits')];
        mockFs[path.join('/', 'project', 'fruits', 'tomato.js', 'index.js')] = `
        // Tomato!
      `;
        e.emit(
          'all',
          'change',
          'tomato.js',
          path.join('/', 'project', 'fruits'),
          MOCK_CHANGE_FOLDER,
        );
        e.emit(
          'all',
          'change',
          path.join('tomato.js', 'index.js'),
          path.join('/', 'project', 'fruits'),
          MOCK_CHANGE_FILE,
        );
        const {eventsQueue} = await waitForItToChange(hm);
        expect(eventsQueue).toHaveLength(1);
      });
    });
  });
});
