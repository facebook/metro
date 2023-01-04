/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

jest.useRealTimers();

jest.mock('child_process', () => ({
  spawn: jest.fn((cmd, args) => {
    let closeCallback;
    return {
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'exit') {
          callback(mockSpawnExit, null);
        }
      }),
      stdout: {
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === 'data') {
            setTimeout(() => {
              callback(mockResponse);
              setTimeout(closeCallback, 0);
            }, 0);
          } else if (event === 'close') {
            closeCallback = callback;
          }
        }),
        setEncoding: jest.fn(),
      },
    };
  }),
}));

jest.mock('graceful-fs', () => {
  const slash = require('slash');
  let mtime = 32;
  const size = 42;
  const stat = (path, callback) => {
    setTimeout(
      () =>
        callback(null, {
          isDirectory() {
            return slash(path).endsWith('/directory');
          },
          isSymbolicLink() {
            return slash(path).endsWith('symlink');
          },
          mtime: {
            getTime() {
              return mtime++;
            },
          },
          size,
        }),
      0,
    );
  };
  return {
    lstat: jest.fn(stat),
    readdir: jest.fn((dir, options, callback) => {
      // readdir has an optional `options` arg that's in the middle of the args list.
      // we always provide it in practice, but let's try to handle the case where it's not
      // provided too
      if (typeof callback === 'undefined') {
        if (typeof options === 'function') {
          callback = options;
        }
        throw new Error('readdir: callback is not a function!');
      }

      if (slash(dir) === '/project/fruits') {
        setTimeout(
          () =>
            callback(null, [
              {
                isDirectory: () => true,
                isSymbolicLink: () => false,
                name: 'directory',
              },
              {
                isDirectory: () => false,
                isSymbolicLink: () => false,
                name: 'tomato.js',
              },
              {
                isDirectory: () => false,
                isSymbolicLink: () => true,
                name: 'symlink',
              },
            ]),
          0,
        );
      } else if (slash(dir) === '/project/fruits/directory') {
        setTimeout(
          () =>
            callback(null, [
              {
                isDirectory: () => false,
                isSymbolicLink: () => false,
                name: 'strawberry.js',
              },
            ]),
          0,
        );
      } else if (slash(dir) == '/error') {
        setTimeout(() => callback({code: 'ENOTDIR'}, undefined), 0);
      }
    }),
    stat: jest.fn(stat),
  };
});

const pearMatcher = path => /pear/.test(path);
const normalize = path =>
  process.platform === 'win32' ? path.replace(/\//g, '\\') : path;
const createMap = obj =>
  new Map(Object.keys(obj).map(key => [normalize(key), obj[key]]));

const rootDir = '/project';
let mockResponse;
let mockSpawnExit;
let nodeCrawl;
let childProcess;

describe('node crawler', () => {
  beforeEach(() => {
    jest.resetModules();

    mockResponse = [
      '/project/fruits/pear.js',
      '/project/fruits/strawberry.js',
      '/project/fruits/tomato.js',
    ].join('\n');

    mockSpawnExit = 0;
  });

  it('crawls for files based on patterns', async () => {
    childProcess = require('child_process');
    nodeCrawl = require('../node');

    mockResponse = [
      '/project/fruits/pear.js',
      '/project/fruits/strawberry.js',
      '/project/fruits/tomato.js',
      '/project/vegetables/melon.json',
    ].join('\n');

    const {changedFiles, removedFiles} = await nodeCrawl({
      previousState: {
        files: new Map(),
      },
      extensions: ['js', 'json'],
      ignore: pearMatcher,
      rootDir,
      roots: ['/project/fruits', '/project/vegtables'],
    });

    expect(childProcess.spawn).lastCalledWith('find', [
      '/project/fruits',
      '/project/vegtables',
      '(',
      '(',
      '-type',
      'f',
      '(',
      '-iname',
      '*.js',
      '-o',
      '-iname',
      '*.json',
      ')',
      ')',
      ')',
    ]);

    expect(changedFiles).not.toBe(null);

    expect(changedFiles).toEqual(
      createMap({
        'fruits/strawberry.js': ['', 32, 42, 0, '', null, 0],
        'fruits/tomato.js': ['', 33, 42, 0, '', null, 0],
        'vegetables/melon.json': ['', 34, 42, 0, '', null, 0],
      }),
    );

    expect(removedFiles).toEqual(new Map());
  });

  it('updates only changed files', async () => {
    nodeCrawl = require('../node');

    // In this test sample, strawberry is changed and tomato is unchanged
    const tomato = ['', 33, 42, 1, '', null, 0];
    const files = createMap({
      'fruits/strawberry.js': ['', 30, 40, 1, '', null, 0],
      'fruits/tomato.js': tomato,
    });

    const {changedFiles, removedFiles} = await nodeCrawl({
      previousState: {files},
      extensions: ['js'],
      ignore: pearMatcher,
      rootDir,
      roots: ['/project/fruits'],
    });

    // Tomato is not included because it is unchanged
    expect(changedFiles).toEqual(
      createMap({
        'fruits/strawberry.js': ['', 32, 42, 0, '', null, 0],
      }),
    );

    expect(removedFiles).toEqual(new Map());
  });

  it('returns removed files', async () => {
    nodeCrawl = require('../node');

    // In this test sample, previouslyExisted was present before and will not be
    // when crawling this directory.
    const files = createMap({
      'fruits/previouslyExisted.js': ['', 30, 40, 1, '', null, 0],
      'fruits/strawberry.js': ['', 33, 42, 0, '', null, 0],
      'fruits/tomato.js': ['', 32, 42, 0, '', null, 0],
    });

    const {changedFiles, removedFiles} = await nodeCrawl({
      previousState: {files},
      extensions: ['js'],
      ignore: pearMatcher,
      rootDir,
      roots: ['/project/fruits'],
    });

    expect(changedFiles).toEqual(
      createMap({
        'fruits/strawberry.js': ['', 32, 42, 0, '', null, 0],
        'fruits/tomato.js': ['', 33, 42, 0, '', null, 0],
      }),
    );
    expect(removedFiles).toEqual(
      createMap({
        'fruits/previouslyExisted.js': ['', 30, 40, 1, '', null, 0],
      }),
    );
  });

  it('uses node fs APIs with incompatible find binary', async () => {
    mockResponse = '';
    mockSpawnExit = 1;
    childProcess = require('child_process');

    nodeCrawl = require('../node');

    const {changedFiles, removedFiles} = await nodeCrawl({
      previousState: {
        files: new Map(),
      },
      extensions: ['js'],
      ignore: pearMatcher,
      rootDir,
      roots: ['/project/fruits'],
    });

    expect(childProcess.spawn).lastCalledWith(
      'find',
      ['.', '-type', 'f', '(', '-iname', '*.ts', '-o', '-iname', '*.js', ')'],
      {cwd: expect.any(String)},
    );
    expect(changedFiles).toEqual(
      createMap({
        'fruits/directory/strawberry.js': ['', 33, 42, 0, '', null, 0],
        'fruits/tomato.js': ['', 32, 42, 0, '', null, 0],
      }),
    );
    expect(removedFiles).toEqual(new Map());
  });

  it('uses node fs APIs without find binary', async () => {
    childProcess = require('child_process');
    childProcess.spawn.mockImplementationOnce(() => {
      throw new Error();
    });
    nodeCrawl = require('../node');

    const {changedFiles, removedFiles} = await nodeCrawl({
      previousState: {
        files: new Map(),
      },
      extensions: ['js'],
      ignore: pearMatcher,
      rootDir,
      roots: ['/project/fruits'],
    });

    expect(changedFiles).toEqual(
      createMap({
        'fruits/directory/strawberry.js': ['', 33, 42, 0, '', null, 0],
        'fruits/tomato.js': ['', 32, 42, 0, '', null, 0],
      }),
    );
    expect(removedFiles).toEqual(new Map());
  });

  it('uses node fs APIs if "forceNodeFilesystemAPI" is set to true, regardless of platform', async () => {
    childProcess = require('child_process');
    nodeCrawl = require('../node');

    const files = new Map();
    const {changedFiles, removedFiles} = await nodeCrawl({
      previousState: {files},
      extensions: ['js'],
      forceNodeFilesystemAPI: true,
      ignore: pearMatcher,
      rootDir,
      roots: ['/project/fruits'],
    });

    expect(childProcess.spawn).toHaveBeenCalledTimes(0);
    expect(changedFiles).toEqual(
      createMap({
        'fruits/directory/strawberry.js': ['', 33, 42, 0, '', null, 0],
        'fruits/tomato.js': ['', 32, 42, 0, '', null, 0],
      }),
    );
    expect(removedFiles).toEqual(new Map());
  });

  it('completes with empty roots', async () => {
    nodeCrawl = require('../node');

    const files = new Map();
    const {changedFiles, removedFiles} = await nodeCrawl({
      previousState: {files},
      extensions: ['js'],
      forceNodeFilesystemAPI: true,
      ignore: pearMatcher,
      rootDir,
      roots: [],
    });

    expect(changedFiles).toEqual(new Map());
    expect(removedFiles).toEqual(new Map());
  });

  it('completes with fs.readdir throwing an error', async () => {
    nodeCrawl = require('../node');

    const files = new Map();
    const {changedFiles, removedFiles} = await nodeCrawl({
      previousState: {files},
      extensions: ['js'],
      forceNodeFilesystemAPI: true,
      ignore: pearMatcher,
      rootDir,
      roots: ['/error'],
    });

    expect(changedFiles).toEqual(new Map());
    expect(removedFiles).toEqual(new Map());
  });

  it('uses the withFileTypes option with readdir', async () => {
    nodeCrawl = require('../node');
    const fs = require('graceful-fs');

    const files = new Map();
    const {changedFiles, removedFiles} = await nodeCrawl({
      previousState: {files},
      extensions: ['js'],
      forceNodeFilesystemAPI: true,
      ignore: pearMatcher,
      rootDir,
      roots: ['/project/fruits'],
    });

    expect(changedFiles).toEqual(
      createMap({
        'fruits/directory/strawberry.js': ['', 33, 42, 0, '', null, 0],
        'fruits/tomato.js': ['', 32, 42, 0, '', null, 0],
      }),
    );
    expect(removedFiles).toEqual(new Map());
    // once for /project/fruits, once for /project/fruits/directory
    expect(fs.readdir).toHaveBeenCalledTimes(2);
    // once for strawberry.js, once for tomato.js
    expect(fs.lstat).toHaveBeenCalledTimes(2);
  });
});
