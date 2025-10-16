/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 * @oncall react_native
 */

import type {InputOptions} from '..';
import type {
  ChangeEvent,
  ChangeEventMetadata,
  FileData,
  FileMetadata,
  FileSystem,
  WatcherBackendOptions,
  WorkerSetupArgs,
} from '../flow-types';
import typeof WorkerModule from '../worker';

import {AbstractWatcher} from '../watchers/AbstractWatcher';
import crypto from 'crypto';
import * as path from 'path';
import {serialize} from 'v8';

jest.useRealTimers();

function mockHashContents(contents: string | Buffer) {
  return crypto.createHash('sha1').update(contents).digest('hex');
}

jest.mock('../lib/checkWatchmanCapabilities', () => ({
  __esModule: true,
  default: async () => ({version: 'v123'}),
}));

jest.mock('jest-worker', () => ({
  Worker: jest.fn((worker, opts) => {
    // $FlowFixMe[unsupported-syntax] - dynamic require
    require(worker).setup(...opts.setupArgs);
    mockProcessFile = jest.fn(async (...args) =>
      // $FlowFixMe[unsupported-syntax] - dynamic require
      require(worker).processFile(...args),
    );
    mockEnd = jest.fn();

    return {
      end: mockEnd,
      processFile: mockProcessFile,
    };
  }),
}));

jest.mock('../crawlers/node', () => ({__esModule: true, default: jest.fn()}));
jest.mock('../crawlers/watchman', () => ({
  __esModule: true,
  default: jest.fn(options => {
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
    const removedFiles: Set<string> = new Set();
    const changedFiles: Map<string, FileMetadata> = new Map();

    previousState.clocks = mockClocks;

    for (const file in list) {
      if (
        new RegExp(roots.join('|').replaceAll('\\', '\\\\')).test(file) &&
        !ignore(file)
      ) {
        const relativeFilePath = path.relative(rootDir, file);
        const contentOrLink = list[file];
        if (contentOrLink) {
          if (typeof contentOrLink === 'string' || includeSymlinks) {
            const hash =
              typeof contentOrLink === 'string' && computeSha1
                ? mockHashContents(contentOrLink)
                : null;
            changedFiles.set(relativeFilePath, [
              32, // mtime
              42, // size
              0, // visited
              '', // dependencies
              hash,
              typeof contentOrLink !== 'string' ? 1 : 0,
              null, // Haste name
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
}));

class MockWatcher extends AbstractWatcher {
  constructor(root: string, opts: WatcherBackendOptions) {
    super(root, opts);
    mockEmitters[root] = this;
  }
}

jest.mock('../watchers/FallbackWatcher', () => MockWatcher);
jest.mock('../watchers/WatchmanWatcher', () => MockWatcher);

type MockFS = {[path: string]: ?string | {link: string}, __proto__: null};

let mockChangedFiles: MockFS;
let mockFs: MockFS;

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
    // $FlowFixMe[prop-missing] code
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
        // $FlowFixMe[prop-missing] code
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

const hasteImplModulePath = require.resolve('./haste_impl.js');
let inBandWorker;
jest.mock('../worker.js', () => {
  const {setup, Worker} = jest.requireActual('../worker') as WorkerModule;
  return {
    setup,
    processFile: mockProcessFileFn,
    Worker: class extends Worker {
      constructor(args: WorkerSetupArgs) {
        super(args);
        inBandWorker = this;
      }
    },
  };
});

const mockProcessFileFn = jest
  .fn()
  .mockImplementation((...args) =>
    jest.requireActual<WorkerModule>('../worker').processFile(...args),
  );

const object = <T>(data: $ReadOnly<{[key: string]: T}>): {[key: string]: T} =>
  // $FlowFixMe[unsafe-object-assign]
  Object.assign(Object.create(null), data);
const createMap = <T>(obj: $ReadOnly<{[key: string]: T}>): Map<string, T> =>
  new Map(Object.entries(obj));
const assertFileSystemEqual = (fileSystem: FileSystem, fileData: FileData) => {
  expect(fileSystem.getDifference(fileData)).toEqual({
    changedFiles: new Map(),
    removedFiles: new Set(),
  });
};

// Jest toEqual does not match Map instances from different contexts
// This normalizes them for the uses cases in this test
const deepNormalize = <T: mixed>(value: T): T => {
  // $FlowFixMe[method-unbinding]
  const stringTag = Object.prototype.toString.call(value);
  switch (stringTag) {
    case '[object Map]':
      // $FlowFixMe[incompatible-type]
      return new Map(
        // $FlowFixMe[incompatible-type]
        Array.from(value).map(([k, v]) => [deepNormalize(k), deepNormalize(v)]),
      );
    case '[object Object]':
      // $FlowFixMe[not-an-object]
      // $FlowFixMe[incompatible-type]
      return Object.keys(value).reduce((obj, key) => {
        // $FlowFixMe[incompatible-use]
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
let HasteConflictsError;
let FileMap;
let mockCacheManager;
let mockClocks;
let mockEmitters: {[root: string]: MockWatcher, __proto__: null};
let mockEnd;
let mockProcessFile;
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

    // $FlowFixMe[incompatible-type]
    mockChangedFiles = null;

    fs = require('graceful-fs');

    consoleWarn = console.warn;
    consoleError = console.error;

    // $FlowFixMe[cannot-write]
    console.warn = jest.fn();
    // $FlowFixMe[cannot-write]
    console.error = jest.fn();

    ({
      default: FileMap,
      DuplicateHasteCandidatesError,
      HasteConflictsError,
    } = require('../'));

    mockCacheManager = {
      read: jest.fn().mockImplementation(async () => cacheContent),
      write: jest.fn().mockImplementation(async getSnapshot => {
        cacheContent = getSnapshot();
      }),
      end: jest.fn(),
    };

    H = FileMap.H;

    cacheContent = null;

    defaultConfig = {
      enableSymlinks: false,
      extensions: ['js', 'json'],
      hasteImplModulePath,
      healthCheck: {
        enabled: false,
        interval: 10000,
        timeout: 1000,
        filePrefix: '.metro-file-map-health-check',
      },
      maxWorkers: 1,
      platforms: ['ios', 'android'],
      resetCache: false,
      retainAllFiles: false,
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
    // $FlowFixMe[cannot-write]
    console.warn = consoleWarn;
    // $FlowFixMe[cannot-write]
    console.error = consoleError;
  });

  test('exports constants', () => {
    expect(FileMap.H).toBe(require('../constants'));
  });

  test('ignores files given a pattern', async () => {
    const config = {...defaultConfig, ignorePattern: /Kiwi/};
    mockFs[path.join('/', 'project', 'fruits', 'Kiwi.js')] = `
      // Kiwi!
    `;
    const {fileSystem} = await new FileMap(config).build();
    expect([...fileSystem.matchFiles({filter: /Kiwi/})]).toEqual([]);
  });

  test('ignores vcs directories without ignore pattern', async () => {
    mockFs[path.join('/', 'project', 'fruits', '.git', 'fruit-history.js')] = `
      // test
    `;
    const {fileSystem} = await new FileMap(defaultConfig).build();
    expect([...fileSystem.matchFiles({filter: /\.git/})]).toEqual([]);
  });

  test('ignores vcs directories with ignore pattern regex', async () => {
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

  test('throw on ignore pattern except for regex', async () => {
    const config = {ignorePattern: 'Kiwi', ...defaultConfig};
    mockFs['/project/fruits/Kiwi.js'] = `
      // Kiwi!
    `;

    try {
      // $FlowExpectedError[incompatible-type]
      await new FileMap(config).build();
    } catch (err) {
      expect(err.message).toBe(
        'metro-file-map: the `ignorePattern` option must be a RegExp',
      );
    }
  });

  test('builds a haste map on a fresh cache', async () => {
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

    expect(cacheContent?.clocks).toEqual(mockClocks);

    assertFileSystemEqual(
      fileSystem,
      createMap({
        [path.join('fruits', 'Banana.js')]: [
          32,
          42,
          1,
          'Strawberry',
          null,
          0,
          'Banana',
        ],
        [path.join('fruits', 'Pear.js')]: [
          32,
          42,
          1,
          'Banana\0Strawberry',
          null,
          0,
          'Pear',
        ],
        [path.join('fruits', 'Strawberry.js')]: [
          32,
          42,
          1,
          '',
          null,
          0,
          'Strawberry',
        ],
        [path.join('fruits', '__mocks__', 'Pear.js')]: [
          32,
          42,
          1,
          'Melon',
          null,
          0,
          null,
        ],
        [path.join('vegetables', 'Melon.js')]: [
          32,
          42,
          1,
          '',
          null,
          0,
          'Melon',
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

    expect(mockMap?.getMockModule('Pear')).toEqual(
      path.resolve(defaultConfig.rootDir, 'fruits', '__mocks__', 'Pear.js'),
    );

    // $FlowFixMe[prop-missing] - MockMap is not MockPlugin
    expect(cacheContent?.plugins.get(mockMap?.name)).toEqual({
      mocks: new Map([['Pear', path.join('fruits', '__mocks__', 'Pear.js')]]),
      duplicates: new Map(),
      version: 2,
    });

    // The cache file must exactly mirror the data structure returned from a
    // read
    expect(deepNormalize(await fileMap.read())).toEqual(cacheContent);
  });

  describe('builds a file map on a fresh cache with SHA-1s', () => {
    test.each([
      [false, false],
      [false, true],
      [true, false],
      [true, true],
    ])(
      'uses watchman: %s, symlinks enabled: %s',
      async (useWatchman, enableSymlinks) => {
        const node = require('../crawlers/node').default;

        // $FlowFixMe[prop-missing]
        // $FlowFixMe[missing-local-annot]
        node.mockImplementation(options => {
          // The node crawler returns "null" for the SHA-1.
          const changedFiles = createMap<FileMetadata>({
            [path.join('fruits', 'Banana.js')]: [
              32,
              42,
              0,
              'Strawberry',
              null,
              0,
              'Banana',
            ],
            [path.join('fruits', 'Pear.js')]: [
              32,
              42,
              0,
              'Banana\0Strawberry',
              null,
              0,
              'Pear',
            ],
            [path.join('fruits', 'Strawberry.js')]: [
              32,
              42,
              0,
              '',
              null,
              0,
              'Strawberry',
            ],
            [path.join('fruits', '__mocks__', 'Pear.js')]: [
              32,
              42,
              0,
              'Melon',
              null,
              0,
              null,
            ],
            [path.join('vegetables', 'Melon.js')]: [
              32,
              42,
              0,
              '',
              null,
              0,
              'Melon',
            ],
            ...(enableSymlinks
              ? {
                  [path.join('fruits', 'LinkToStrawberry.js')]: [
                    32,
                    42,
                    0,
                    '',
                    null,
                    1,
                    null,
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
              32,
              42,
              1,
              'Strawberry',
              '7772b628e422e8cf59c526be4bb9f44c0898e3d1',
              0,
              'Banana',
            ],
            [path.join('fruits', 'Pear.js')]: [
              32,
              42,
              1,
              'Banana\0Strawberry',
              '89d0c2cc11dcc5e1df50b8af04ab1b597acfba2f',
              0,
              'Pear',
            ],
            [path.join('fruits', 'Strawberry.js')]: [
              32,
              42,
              1,
              '',
              'e8aa38e232b3795f062f1d777731d9240c0f8c25',
              0,
              'Strawberry',
            ],
            [path.join('fruits', '__mocks__', 'Pear.js')]: [
              32,
              42,
              1,
              'Melon',
              '8d40afbb6e2dc78e1ba383b6d02cafad35cceef2',
              0,
              null,
            ],
            [path.join('vegetables', 'Melon.js')]: [
              32,
              42,
              1,
              '',
              'f16ccf6f2334ceff2ddb47628a2c5f2d748198ca',
              0,
              'Melon',
            ],
            ...(enableSymlinks
              ? {
                  [path.join('fruits', 'LinkToStrawberry.js')]: [
                    32,
                    42,
                    1,
                    '',
                    null,
                    null,
                  ],
                }
              : null),
          }),
        );

        expect(deepNormalize(await fileMap.read())).toEqual(cacheContent);
      },
    );
  });

  test('handles a Haste module moving between builds', async () => {
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
      [path.join('/', 'project', 'fruits', 'Melon.js')]: `
      // Melon is a fruit!
    `,
      [path.join('/', 'project', 'vegetables', 'Melon.js')]: null, // Mock deletion
    });

    const newData = await new FileMap(defaultConfig).build();

    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();

    // Haste Melon is in its new location and not duplicated.
    expect(newData.hasteMap.getModule('Melon')).toEqual(
      path.join('/', 'project', 'fruits', 'Melon.js'),
    );
  });

  test('does not crawl native files even if requested to do so', async () => {
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
      size: 42,
    });
    // $FlowFixMe[incompatible-use]
    expect(fs.readFileSync.mock.calls.map(call => call[0])).not.toContain(
      path.join('video', 'video.mp4'),
    );
  });

  test('retains all files if `retainAllFiles` is specified', async () => {
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
    ).toEqual({fileType: 'f', modifiedTime: 32, size: 42});

    expect(hasteMap.getModule('fbjs')).toBeNull();

    // 5 modules - the node_module
    // $FlowFixMe[incompatible-use]
    expect(fs.readFileSync.mock.calls.length).toBe(5);
  });

  test('builds a mock map if mocksPattern is non-null', async () => {
    const pathToMock = path.join(
      '/',
      'project',
      'fruits1',
      '__mocks__',
      'Blueberry.js',
    );
    mockFs[pathToMock] = '/* empty */';

    const {mockMap} = await new FileMap({
      mocksPattern: '__mocks__',
      throwOnModuleCollision: true,
      ...defaultConfig,
    }).build();

    expect(mockMap).not.toBeNull();
    expect(mockMap?.getMockModule('Blueberry')).toEqual(pathToMock);
  });

  test('returns null mockMap if mocksPattern is empty', async () => {
    const {mockMap} = await new FileMap({
      mocksPattern: '',
      throwOnModuleCollision: true,
      ...defaultConfig,
    }).build();

    expect(mockMap).toBeNull();
  });

  test('throws on duplicate mock files when throwOnModuleCollision', async () => {
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

    const mockWarn = jest.fn();

    const expectedError =
      'Duplicate manual mock found for `subdir/Blueberry`:\n' +
      '    * <rootDir>/../../fruits1/__mocks__/subdir/Blueberry.js\n' +
      '    * <rootDir>/../../fruits2/__mocks__/subdir/Blueberry.js\n';

    await expect(() =>
      new FileMap({
        mocksPattern: '__mocks__',
        throwOnModuleCollision: true,
        ...defaultConfig,
        console: {
          ...globalThis.console,
          warn: mockWarn,
        },
      }).build(),
    ).rejects.toThrowError('Mock map has 1 error:\n' + expectedError);
    expect(mockWarn).toHaveBeenCalledWith(expectedError);
  });

  test('warns on duplicate module ids', async () => {
    mockFs[path.join('/', 'project', 'fruits', 'other', 'Strawberry.js')] = `
      const Banana = require("Banana");
    `;

    const {hasteMap} = await new FileMap(defaultConfig).build();

    expect(() => hasteMap.getModule('Strawberry')).toThrow(
      DuplicateHasteCandidatesError,
    );

    expect(
      // $FlowFixMe[prop-missing]
      console.warn.mock.calls[0][0].replaceAll('\\', '/'),
    ).toMatchSnapshot();
  });

  test('throws on duplicate module ids if "throwOnModuleCollision" is set to true', async () => {
    expect.assertions(2);
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
      expect(err).toBeInstanceOf(HasteConflictsError);
      expect(err.getDetailedMessage()).toMatchSnapshot();
    }
  });

  test('splits up modules by platform', async () => {
    mockFs = Object.create(null) as MockFS;
    // $FlowFixMe[prop-missing]
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
          32,
          42,
          1,
          'Blackberry',
          null,
          0,
          'Strawberry',
        ],
        [path.join('fruits', 'Strawberry.ios.js')]: [
          32,
          42,
          1,
          'Raspberry',
          null,
          0,
          'Strawberry',
        ],
        [path.join('fruits', 'Strawberry.js')]: [
          32,
          42,
          1,
          'Banana',
          null,
          0,
          'Strawberry',
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

  test('does not access the file system on a warm cache with no changes', async () => {
    await new FileMap(defaultConfig).build();
    const initialData = cacheContent;

    // First run should attempt to read the cache, but there will be no result
    expect(mockCacheManager.read).toHaveBeenCalledTimes(1);
    // and it should write a new cache
    expect(mockCacheManager.write).toHaveBeenCalledTimes(1);

    // The first run should access the file system five times for the regular
    // files in the system.
    // $FlowFixMe[incompatible-use]
    expect(fs.readFileSync.mock.calls.length).toBe(5);

    // $FlowFixMe[incompatible-type]
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
    // $FlowFixMe[incompatible-use]
    expect(fs.readFileSync.mock.calls.length).toBe(0);
    expect(deepNormalize(data?.clocks)).toEqual(mockClocks);
    expect(serialize(data?.fileSystem)).toEqual(
      serialize(initialData?.fileSystem),
    );
  });

  test('only does minimal file system access when files change', async () => {
    // Run with a cold cache initially
    const {fileSystem: initialFileSystem} = await new FileMap(
      defaultConfig,
    ).build();

    expect(
      initialFileSystem.getDependencies(path.join('fruits', 'Banana.js')),
    ).toEqual(['Strawberry']);

    // $FlowFixMe[incompatible-type]
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

    expect(deepNormalize(data?.clocks)).toEqual(mockClocks);

    expect(
      fileSystem.getDependencies(path.join('fruits', 'Banana.js')),
    ).toEqual(['Kiwi']);
  });

  test('correctly handles file deletions', async () => {
    await new FileMap(defaultConfig).build();
    // $FlowFixMe[incompatible-type]
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

  test('correctly handles platform-specific file additions', async () => {
    mockFs = Object.create(null) as MockFS;
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

  test('correctly handles platform-specific file deletions', async () => {
    mockFs = Object.create(null) as MockFS;
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

  test('correctly handles platform-specific file renames', async () => {
    mockFs = Object.create(null) as MockFS;
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
      [path.join('/', 'project', 'fruits', 'Strawberry.js')]: `
        const Banana = require("Banana");
      `,
      [path.join('/', 'project', 'fruits', 'Strawberry.ios.js')]: null,
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
          ]),
        ),
      );
      expect(hasteMap.getModule('Banana')).toBeDefined();
      expect(() => hasteMap.getModule('Banana', 'ios')).toThrow(
        new DuplicateHasteCandidatesError(
          'Banana',
          'ios',
          false,
          new Map([
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

    test('recovers when a duplicate file is deleted', async () => {
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

    test('recovers when a duplicate platform-specific file is deleted', async () => {
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

    test('recovers with the correct type when a duplicate file is deleted', async () => {
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
      expect(initialStrawberryError?.duplicatesSet).toEqual(
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

    test('recovers when a duplicate module is renamed', async () => {
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

  test('ignores files that do not exist', async () => {
    const watchman = require('../crawlers/watchman').default;
    // $FlowFixMe[prop-missing]
    const mockImpl: typeof watchman = watchman.getMockImplementation();
    // Wrap the watchman mock and add an invalid file to the file list.
    const invalidFilePath = path.join('fruits', 'invalid', 'file.js');
    // $FlowFixMe[prop-missing]
    // $FlowFixMe[missing-local-annot]
    watchman.mockImplementation(async options => {
      const {changedFiles} = await mockImpl(options);
      changedFiles.set(invalidFilePath, [34, 44, 0, '', null, 0, null]);
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

  test('distributes work across workers', async () => {
    const jestWorker = require('jest-worker').Worker;
    const path = require('path');
    const dependencyExtractor = path.join(__dirname, 'dependencyExtractor.js');
    await new FileMap({
      ...defaultConfig,
      dependencyExtractor,
      hasteImplModulePath: undefined,
      maxWorkers: 4,
      maxFilesPerWorker: 2,
    }).build();

    expect(jestWorker).toHaveBeenCalledTimes(1);

    expect(jestWorker).toHaveBeenCalledWith(
      expect.stringContaining('worker.js'),
      expect.objectContaining({
        // With maxFilesPerWorker = 2 and 5 files, we should have 3 workers.
        numWorkers: 3,
        setupArgs: [
          {
            dependencyExtractor,
            plugins: [
              {
                workerModulePath: expect.stringMatching(
                  /src[\\\/]plugins[\\\/]haste[\\\/]worker\.js/,
                ),
                workerSetupArgs: {
                  enableHastePackages: true,
                  hasteImplModulePath: null,
                },
              },
            ],
          },
        ],
      }),
    );

    expect(mockProcessFile.mock.calls.length).toBe(5);

    expect(mockProcessFile.mock.calls).toEqual([
      [
        {
          computeDependencies: true,
          computeSha1: false,
          filePath: path.join('/', 'project', 'fruits', 'Banana.js'),
          isNodeModules: false,
          maybeReturnContent: false,
        },
      ],
      [
        {
          computeDependencies: true,
          computeSha1: false,
          filePath: path.join('/', 'project', 'fruits', 'Pear.js'),
          isNodeModules: false,
          maybeReturnContent: false,
        },
      ],
      [
        {
          computeDependencies: true,
          computeSha1: false,
          filePath: path.join('/', 'project', 'fruits', 'Strawberry.js'),
          isNodeModules: false,
          maybeReturnContent: false,
        },
      ],
      [
        {
          computeDependencies: true,
          computeSha1: false,
          filePath: path.join('/', 'project', 'fruits', '__mocks__', 'Pear.js'),
          isNodeModules: false,
          maybeReturnContent: false,
        },
      ],
      [
        {
          computeDependencies: true,
          computeSha1: false,
          filePath: path.join('/', 'project', 'vegetables', 'Melon.js'),
          isNodeModules: false,
          maybeReturnContent: false,
        },
      ],
    ]);

    expect(mockEnd).toBeCalled();
  });

  test('tries to crawl using node as a fallback', async () => {
    const watchman = require('../crawlers/watchman').default;
    const node = require('../crawlers/node').default;

    // $FlowFixMe[prop-missing]
    watchman.mockImplementation(() => {
      throw new Error('watchman error');
    });
    // $FlowFixMe[prop-missing]
    node.mockImplementation((() => {
      return Promise.resolve({
        changedFiles: createMap({
          [path.join('fruits', 'Banana.js')]: [32, 42, 0, '', null, 0, null],
        }),
        removedFiles: new Set(),
      });
    }) as typeof node);

    const {fileSystem} = await new FileMap(defaultConfig).build();

    expect(watchman).toBeCalled();
    expect(node).toBeCalled();

    assertFileSystemEqual(
      fileSystem,
      createMap({
        [path.join('fruits', 'Banana.js')]: [
          32,
          42,
          1,
          'Strawberry',
          null,
          0,
          'Banana',
        ],
      }),
    );

    // $FlowFixMe[prop-missing]
    expect(console.warn.mock.calls[0][0]).toMatchSnapshot();
  });

  test('tries to crawl using node as a fallback when promise fails once', async () => {
    const watchman = require('../crawlers/watchman').default;
    const node = require('../crawlers/node').default;

    // $FlowFixMe[prop-missing]
    watchman.mockImplementation(() =>
      Promise.reject(new Error('watchman error')),
    );
    // $FlowFixMe[prop-missing]
    node.mockImplementation(() => {
      return Promise.resolve({
        changedFiles: createMap<FileMetadata>({
          [path.join('fruits', 'Banana.js')]: [32, 42, 0, '', null, 0, null],
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
          32,
          42,
          1,
          'Strawberry',
          null,
          0,
          'Banana',
        ],
      }),
    );
  });

  test('stops crawling when both crawlers fail', async () => {
    expect.assertions(1);
    const watchman = require('../crawlers/watchman').default;
    const node = require('../crawlers/node').default;

    // $FlowFixMe[prop-missing]
    watchman.mockImplementation(() =>
      Promise.reject(new Error('watchman error')),
    );

    // $FlowFixMe[prop-missing]
    node.mockImplementation(() => Promise.reject(new Error('node error')));

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
    function waitForItToChange(
      fileMap: FileMap,
    ): Promise<{eventsQueue: ChangeEvent}> {
      return new Promise(resolve => {
        fileMap.once('change', resolve);
      });
    }

    function mockDeleteFile(root: string, relativePath: string) {
      const e = mockEmitters[root];
      e.emitFileEvent({event: 'delete', relativePath});
    }

    type FileMapTestOptions = $ReadOnly<{
      only?: boolean,
      mockFs?: MockFS,
      config?: Partial<InputOptions>,
    }>;

    function fm_it(
      title: string,
      fn: (fm: FileMap) => mixed,
      options?: FileMapTestOptions = {},
    ): void {
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
          // $FlowFixMe[unused-promise]
          hm.end();
        }
      });
    }

    fm_it.only = (
      title: string,
      fn: () => mixed,
      options?: FileMapTestOptions,
    ): void => fm_it(title, fn, {...options, only: true});

    fm_it('build returns a "live" fileSystem and hasteMap', async hm => {
      const {fileSystem, hasteMap} = await hm.build();
      const filePath = path.join('/', 'project', 'fruits', 'Banana.js');
      expect(fileSystem.exists(filePath)).toBe(true);
      expect(hasteMap.getModuleNameByPath(filePath)).toBe('Banana');
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
      expect(fileSystem.exists(filePath)).toBe(false);
      expect(hasteMap.getModuleNameByPath(filePath)).toBeNull();
      expect(hasteMap.getModule('Banana')).toBeNull();
    });

    const MOCK_CHANGE_FILE: ChangeEventMetadata = {
      type: 'f',
      modifiedTime: 45,
      size: 55,
    };

    const MOCK_DELETE_FILE: ChangeEventMetadata = {
      type: 'f',
      modifiedTime: null,
      size: null,
    };

    const MOCK_CHANGE_LINK: ChangeEventMetadata = {
      type: 'l',
      modifiedTime: 46,
      size: 5,
    };

    const MOCK_DELETE_LINK: ChangeEventMetadata = {
      type: 'l',
      modifiedTime: null,
      size: null,
    };

    const MOCK_CHANGE_FOLDER: ChangeEventMetadata = {
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
      e.emitFileEvent({
        event: 'touch',
        relativePath: 'Tomato.js',
        metadata: MOCK_CHANGE_FILE,
      });
      e.emitFileEvent({
        event: 'touch',
        relativePath: 'Pear.js',
        metadata: MOCK_CHANGE_FILE,
      });
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
        fileSystem.exists(path.join('/', 'project', 'fruits', 'Tomato.js')),
      ).toBe(true);
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
      e.emitFileEvent({
        event: 'touch',
        relativePath: 'Tomato.js',
        metadata: MOCK_CHANGE_FILE,
      });
      e.emitFileEvent({
        event: 'touch',
        relativePath: 'Tomato.js',
        metadata: MOCK_CHANGE_FILE,
      });
      const {eventsQueue} = await waitForItToChange(hm);
      expect(eventsQueue).toHaveLength(1);
    });

    fm_it(
      'file data is still available during processing',
      async hm => {
        const e = mockEmitters[path.join('/', 'project', 'fruits')];
        const {fileSystem, hasteMap} = await hm.build();
        // Pre-existing file
        const bananaPath = path.join('/', 'project', 'fruits', 'Banana.js');
        expect(fileSystem.linkStats(bananaPath)).toEqual({
          fileType: 'f',
          modifiedTime: 32,
          size: 42,
        });
        const originalHash = fileSystem.getSha1(bananaPath);
        expect(typeof originalHash).toBe('string');

        mockFs[bananaPath] = `
        // Modified banana!
      `;
        e.emitFileEvent({
          event: 'touch',
          relativePath: 'Banana.js',
          metadata: {
            type: 'f',
            modifiedTime: 33,
            size: 500,
          },
        });

        const workerSpy = jest.spyOn(inBandWorker, 'processFile');
        expect(workerSpy).not.toBeCalled();
        await null;
        expect(workerSpy).toBeCalled();

        // Initially, expect same data as before
        expect(fileSystem.linkStats(bananaPath)).toEqual({
          fileType: 'f',
          modifiedTime: 32,
          size: 42,
        });
        expect(fileSystem.getSha1(bananaPath)).toBe(originalHash);
        expect(hasteMap.getModule('Banana')).toBe(bananaPath);

        const {eventsQueue} = await waitForItToChange(hm);
        expect(eventsQueue).toHaveLength(1);

        // After the 'change' event is emitted, we should have new data
        expect(fileSystem.linkStats(bananaPath)).toEqual({
          fileType: 'f',
          modifiedTime: 33,
          size: 500,
        });
        const newHash = fileSystem.getSha1(bananaPath);
        expect(typeof newHash).toBe('string');
        expect(newHash).not.toBe(originalHash);
      },
      {config: {computeSha1: true}},
    );

    fm_it(
      'suppresses backend symlink events if enableSymlinks: false',
      async hm => {
        const {fileSystem} = await hm.build();
        const fruitsRoot = path.join('/', 'project', 'fruits');
        const e = mockEmitters[fruitsRoot];
        e.emitFileEvent({
          event: 'touch',
          relativePath: 'Strawberry.js',
          metadata: MOCK_CHANGE_FILE,
        });
        e.emitFileEvent({
          event: 'touch',
          relativePath: 'LinkToStrawberry.js',
          metadata: MOCK_CHANGE_LINK,
        });
        const {eventsQueue} = await waitForItToChange(hm);
        expect(eventsQueue).toEqual([
          {
            filePath: path.join(fruitsRoot, 'Strawberry.js'),
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
        e.emitFileEvent({
          event: 'touch',
          relativePath: 'Strawberry.js',
          metadata: MOCK_CHANGE_FILE,
        });
        e.emitFileEvent({
          event: 'touch',
          relativePath: 'LinkToStrawberry.js',
          metadata: MOCK_CHANGE_LINK,
        });
        const {eventsQueue} = await waitForItToChange(hm);
        expect(eventsQueue).toEqual([
          {
            filePath: path.join(fruitsRoot, 'Strawberry.js'),
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
        ).toEqual({fileType: 'l', modifiedTime: 46, size: 5});
      },
      {config: {enableSymlinks: true}},
    );

    fm_it(
      'emits a change even if a file in node_modules has changed',
      async hm => {
        const {fileSystem} = await hm.build();
        const e = mockEmitters[path.join('/', 'project', 'fruits')];
        e.emitFileEvent({
          event: 'touch',
          relativePath: path.join('node_modules', 'apple.js'),
          metadata: MOCK_CHANGE_FILE,
        });
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
        expect(fileSystem.exists(filePath)).toBe(true);
      },
    );

    fm_it(
      'does not emit changes for regular files with unwatched extensions',
      async hm => {
        const {fileSystem} = await hm.build();
        mockFs[path.join('/', 'project', 'fruits', 'Banana.unwatched')] = '';

        const e = mockEmitters[path.join('/', 'project', 'fruits')];
        e.emitFileEvent({
          event: 'touch',
          relativePath: 'Banana.js',
          metadata: MOCK_CHANGE_FILE,
        });
        e.emitFileEvent({
          event: 'touch',
          relativePath: 'Banana.unwatched',
          metadata: MOCK_CHANGE_FILE,
        });
        const {eventsQueue} = await waitForItToChange(hm);
        const filePath = path.join('/', 'project', 'fruits', 'Banana.js');
        expect(eventsQueue).toHaveLength(1);
        expect(eventsQueue).toEqual([
          {filePath, metadata: MOCK_CHANGE_FILE, type: 'change'},
        ]);
        expect(fileSystem.exists(filePath)).toBe(true);
      },
    );

    fm_it('does not emit delete events for unknown files', async hm => {
      const {fileSystem} = await hm.build();
      mockFs[path.join('/', 'project', 'fruits', 'Banana.unwatched')] = '';

      const e = mockEmitters[path.join('/', 'project', 'fruits')];
      e.emitFileEvent({
        event: 'delete',
        relativePath: 'Banana.js',
      });
      e.emitFileEvent({
        event: 'delete',
        relativePath: 'Unknown.ext',
      });
      const {eventsQueue} = await waitForItToChange(hm);
      const filePath = path.join('/', 'project', 'fruits', 'Banana.js');
      expect(eventsQueue).toHaveLength(1);
      expect(eventsQueue).toEqual([
        {filePath, metadata: MOCK_DELETE_FILE, type: 'delete'},
      ]);
      expect(fileSystem.exists(filePath)).toBe(false);
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
        e.emitFileEvent({
          event: 'touch',
          relativePath: 'LinkToStrawberry.ext',
          metadata: MOCK_CHANGE_LINK,
        });
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
          size: 5,
        });
        // lookup traverses the symlink, verifying the link is read.
        expect(fileSystem.lookup(filePath)).toEqual(
          expect.objectContaining({
            exists: true,
            realPath: expect.stringMatching(/Strawberry\.js$/),
          }),
        );
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

        expect(hasteMap.getModuleNameByPath(symlinkPath)).toEqual('Strawberry');
        expect(hasteMap.getModuleNameByPath(realPath)).toEqual('Strawberry');
        expect(hasteMap.getModule('Strawberry', 'g')).toEqual(realPath);

        // Delete the symlink
        const e = mockEmitters[path.join('/', 'project', 'fruits')];
        delete mockFs[symlinkPath];
        e.emitFileEvent({
          event: 'delete',
          relativePath: 'LinkToStrawberry.js',
        });
        const {eventsQueue} = await waitForItToChange(hm);

        expect(eventsQueue).toHaveLength(1);
        expect(eventsQueue).toEqual([
          {filePath: symlinkPath, metadata: MOCK_DELETE_LINK, type: 'delete'},
        ]);

        // Symlink is deleted without affecting the Haste module or real file.
        expect(fileSystem.exists(symlinkPath)).toBe(false);
        expect(fileSystem.exists(realPath)).toBe(true);
        expect(hasteMap.getModuleNameByPath(symlinkPath)).toEqual(null);
        expect(hasteMap.getModuleNameByPath(realPath)).toEqual('Strawberry');
        expect(hasteMap.getModule('Strawberry', 'g')).toEqual(realPath);
      },
      {config: {enableSymlinks: true}},
    );

    fm_it(
      'correctly tracks changes to both platform-specific versions of a single module name',
      async hm => {
        const {hasteMap} = await hm.build();
        expect(hasteMap.getModule('Orange', 'ios')).toBeTruthy();
        expect(hasteMap.getModule('Orange', 'android')).toBeTruthy();
        const e = mockEmitters[path.join('/', 'project', 'fruits')];
        e.emitFileEvent({
          event: 'touch',
          relativePath: 'Orange.ios.js',
          metadata: MOCK_CHANGE_FILE,
        });
        e.emitFileEvent({
          event: 'touch',
          relativePath: 'Orange.android.js',
          metadata: MOCK_CHANGE_FILE,
        });
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
          hasteMap.getModuleNameByPath(
            path.join('/', 'project', 'fruits', 'Orange.ios.js'),
          ),
        ).toBeTruthy();
        expect(
          hasteMap.getModuleNameByPath(
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

      mockEmitters[path.join('/', 'project', 'vegetables')].emitFileEvent({
        event: 'delete',
        relativePath: 'Melon.js',
      });
      mockEmitters[path.join('/', 'project', 'fruits')].emitFileEvent({
        event: 'touch',
        relativePath: 'Melon.js',
        metadata: MOCK_CHANGE_FILE,
      });

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
      async function setupDuplicates(hm: FileMap) {
        const {fileSystem, hasteMap} = await hm.build();
        mockFs[path.join('/', 'project', 'fruits', 'Pear.js')] = `
          // Pear!
        `;
        mockFs[path.join('/', 'project', 'fruits', 'another', 'Pear.js')] = `
          // Pear too!
        `;
        const e = mockEmitters[path.join('/', 'project', 'fruits')];
        e.emitFileEvent({
          event: 'touch',
          relativePath: 'Pear.js',
          metadata: MOCK_CHANGE_FILE,
        });
        e.emitFileEvent({
          event: 'touch',
          relativePath: path.join('another', 'Pear.js'),
          metadata: MOCK_CHANGE_FILE,
        });
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
        'does not throw on a duplicate created at runtime even if throwOnModuleCollision: true',
        async hm => {
          mockFs[path.join('/', 'project', 'fruits', 'Pear.js')] = `
          // Pear!
        `;
          mockFs[path.join('/', 'project', 'fruits', 'another', 'Pear.js')] = `
          // Pear too!
        `;
          const {fileSystem} = await hm.build();
          const e = mockEmitters[path.join('/', 'project', 'fruits')];
          e.emitFileEvent({
            event: 'touch',
            relativePath: 'Pear.js',
            metadata: MOCK_CHANGE_FILE,
          });
          e.emitFileEvent({
            event: 'touch',
            relativePath: path.join('another', 'Pear.js'),
            metadata: MOCK_CHANGE_FILE,
          });
          await new Promise((resolve, reject) => {
            // $FlowFixMe[prop-missing]
            console.error.mockImplementationOnce(() => {
              reject(new Error('should not print error'));
            });
            hm.once('change', resolve);
          });
          // Expect a warning to be printed, but no error.
          expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining(
              'metro-file-map: Haste module naming collision: Pear',
            ),
          );
          // Both files should be added to the fileSystem, despite the Haste
          // collision
          expect(
            fileSystem.exists(path.join('/', 'project', 'fruits', 'Pear.js')),
          ).toBe(true);
          expect(
            fileSystem.exists(
              path.join('/', 'project', 'fruits', 'another', 'Pear.js'),
            ),
          ).toBe(true);
        },
        {
          config: {
            throwOnModuleCollision: true,
          },
        },
      );

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
          e.emitFileEvent({
            event: 'delete',
            relativePath: 'Pear.js',
          });
          e.emitFileEvent({
            event: 'touch',
            relativePath: 'Pear2.js',
            metadata: MOCK_CHANGE_FILE,
          });
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
        e.emitFileEvent({
          event: 'touch',
          relativePath: path.join('another', 'Pear2.js'),
          metadata: MOCK_CHANGE_FILE,
        });
        e.emitFileEvent({
          event: 'delete',
          relativePath: path.join('another', 'Pear.js'),
        });
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
        e.emitFileEvent({
          event: 'touch',
          relativePath: 'tomato.js',
          metadata: MOCK_CHANGE_FOLDER,
        });
        e.emitFileEvent({
          event: 'touch',
          relativePath: path.join('tomato.js', 'index.js'),
          metadata: MOCK_CHANGE_FILE,
        });
        const {eventsQueue} = await waitForItToChange(hm);
        expect(eventsQueue).toHaveLength(1);
      });
    });
  });
});
