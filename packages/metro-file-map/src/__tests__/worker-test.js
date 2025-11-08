/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 * @oncall react_native
 */

import type {WorkerMessage, WorkerMetadata} from '../flow-types';
import typeof TWorker from '../worker';
import typeof FS from 'fs';

import {HastePlugin} from '..';
import {Worker} from '../worker';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

jest.mock('fs', () => {
  const path = require('path');
  const mockFs = {
    [path.join('/project', 'fruits', 'Banana.js')]: `
        const Strawberry = require("Strawberry");
      ` as Buffer | string | $ReadOnly<{link: string}>,
    [path.join('/project', 'fruits', 'Pear.js')]: `
        const Banana = require("Banana");
        const Strawberry = require('Strawberry');
        const Lime = loadModule('Lime');
      `,
    [path.join('/project', 'fruits', 'Strawberry.js')]: `
        // Strawberry!
      `,
    [path.join('/project', 'fruits', 'LinkToStrawberry.js')]: {
      link: path.join('.', 'Strawberry.js'),
    },
    [path.join('/project', 'fruits', 'apple.png')]: Buffer.from([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]),
    [path.join('/project', 'package.json')]: `
        {
          "name": "haste-package",
          "main": "foo.js"
        }
      `,
  };

  return {
    ...jest.createMockFromModule('fs'),
    readFileSync: jest.fn((path, options) => {
      const entry = mockFs[path];
      if (entry) {
        if (typeof entry === 'string') {
          return options === 'utf8' ? entry : Buffer.from(entry);
        }
        if (entry instanceof Buffer) {
          return options === 'utf8' ? entry.toString('utf8') : entry;
        }
        throw new Error('Tried to call readFile on a symlink');
      }
      throw new Error(`Cannot read path '${path}'.`);
    }),
  };
});

const defaults: WorkerMessage = {
  isNodeModules: false,
  computeDependencies: false,
  computeSha1: false,
  filePath: path.join('/project', 'notexist.js'),
  maybeReturnContent: false,
};

const defaultHasteConfig = {
  enableHastePackages: true,
  failValidationOnConflicts: false,
  hasteImplModulePath: require.resolve('./haste_impl.js'),
  platforms: new Set(['ios', 'android']),
  rootDir: path.normalize('/project'),
};

function workerWithHaste(
  message: WorkerMessage,
  hasteOverrides: Partial<typeof defaultHasteConfig> = {},
) {
  return new Worker({
    plugins: [
      new HastePlugin({
        ...defaultHasteConfig,
        ...hasteOverrides,
      }).getWorker(),
    ],
  }).processFile(message);
}

describe('worker', () => {
  let worker: (message: WorkerMessage) => Promise<WorkerMetadata>;

  beforeEach(() => {
    jest.clearAllMocks();
    const workerInstance = new Worker({plugins: []});
    worker = async message => workerInstance.processFile(message);
  });

  const defaults: WorkerMessage = {
    computeDependencies: false,
    computeSha1: false,
    isNodeModules: false,
    filePath: path.join('/project', 'notexist.js'),
    maybeReturnContent: false,
  };

  test('parses JavaScript files and extracts module information', async () => {
    expect(
      await worker({
        ...defaults,
        computeDependencies: true,
        filePath: path.join('/project', 'fruits', 'Pear.js'),
      }),
    ).toEqual({
      dependencies: ['Banana', 'Strawberry'],
      pluginData: [],
    });

    expect(
      await worker({
        ...defaults,
        computeDependencies: true,
        filePath: path.join('/project', 'fruits', 'Strawberry.js'),
      }),
    ).toEqual({
      dependencies: [],
      pluginData: [],
    });
  });

  test('accepts a custom dependency extractor', async () => {
    expect(
      await new Worker({
        dependencyExtractor: path.join(__dirname, 'dependencyExtractor.js'),
        plugins: [],
      }).processFile({
        ...defaults,
        computeDependencies: true,
        filePath: path.join('/project', 'fruits', 'Pear.js'),
      }),
    ).toEqual({
      dependencies: ['Banana', 'Strawberry', 'Lime'],
      pluginData: [],
    });
  });

  test('delegates to hasteImplModulePath for getting the id', async () => {
    expect(
      await workerWithHaste({
        ...defaults,
        computeDependencies: true,
        filePath: path.join('/project', 'fruits', 'Pear.js'),
      }),
    ).toEqual({
      dependencies: ['Banana', 'Strawberry'],
      pluginData: ['Pear'],
    });

    expect(
      await workerWithHaste({
        ...defaults,
        computeDependencies: true,
        filePath: path.join('/project', 'fruits', 'Strawberry.js'),
      }),
    ).toEqual({
      dependencies: [],
      pluginData: ['Strawberry'],
    });
  });

  test('parses package.json files as haste packages when enableHastePackages=true', async () => {
    expect(
      await workerWithHaste(
        {
          ...defaults,
          computeDependencies: true,
          filePath: path.join('/project', 'package.json'),
        },
        {enableHastePackages: true},
      ),
    ).toEqual({
      dependencies: undefined,
      pluginData: ['haste-package'],
    });
  });

  test('does not parse package.json files as haste packages when enableHastePackages=false', async () => {
    expect(
      await workerWithHaste(
        {
          ...defaults,
          computeDependencies: true,
          filePath: path.join('/project', 'package.json'),
        },
        {enableHastePackages: false},
      ),
    ).toEqual({
      dependencies: undefined,
      pluginData: [null],
    });
  });

  test('returns an error when a file cannot be accessed', async () => {
    let error = null;

    try {
      await worker({
        ...defaults,
        computeDependencies: true,
        filePath: '/kiwi.js',
      });
    } catch (err) {
      error = err;
    }

    expect(error?.message).toEqual(`Cannot read path '/kiwi.js'.`);
  });

  test('simply computes SHA-1s when requested (works well with binary data)', async () => {
    expect(
      await worker({
        ...defaults,
        computeSha1: true,
        filePath: path.join('/project', 'fruits', 'apple.png'),
      }),
    ).toEqual({
      pluginData: [],
      sha1: '4caece539b039b16e16206ea2478f8c5ffb2ca05',
    });

    expect(
      await worker({
        ...defaults,
        computeSha1: false,
        filePath: path.join('/project', 'fruits', 'Banana.js'),
      }),
    ).toEqual({pluginData: [], sha1: undefined});

    expect(
      await worker({
        ...defaults,
        computeSha1: true,
        filePath: path.join('/project', 'fruits', 'Banana.js'),
      }),
    ).toEqual({
      pluginData: [],
      sha1: '7772b628e422e8cf59c526be4bb9f44c0898e3d1',
    });

    expect(
      await worker({
        ...defaults,
        computeSha1: true,
        filePath: path.join('/project', 'fruits', 'Pear.js'),
      }),
    ).toEqual({
      pluginData: [],
      sha1: 'c7a7a68a1c8aaf452669dd2ca52ac4a434d25552',
    });

    await expect(() =>
      worker({...defaults, computeSha1: true, filePath: '/i/dont/exist.js'}),
    ).rejects.toThrow();
  });

  test('avoids computing dependencies if not requested and Haste does not need it', async () => {
    expect(
      await workerWithHaste({
        ...defaults,
        computeDependencies: false,
        filePath: path.join('/project', 'fruits', 'Pear.js'),
      }),
    ).toEqual({
      dependencies: undefined,
      pluginData: ['Pear'],
      sha1: undefined,
    });

    // Ensure not disk access happened.
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  test('returns content if requested and content is read', async () => {
    expect(
      await workerWithHaste({
        ...defaults,
        computeSha1: true,
        filePath: path.join('/project', 'fruits', 'Pear.js'),
        maybeReturnContent: true,
      }),
    ).toEqual({
      content: expect.any(Buffer),
      pluginData: ['Pear'],
      sha1: 'c7a7a68a1c8aaf452669dd2ca52ac4a434d25552',
    });
  });

  test('does not return content if maybeReturnContent but content is not read', async () => {
    expect(
      await workerWithHaste({
        ...defaults,
        computeSha1: false,
        filePath: path.join('/project', 'fruits', 'Pear.js'),
        maybeReturnContent: true,
      }),
    ).toEqual({
      content: undefined,
      dependencies: undefined,
      pluginData: ['Pear'],
      sha1: undefined,
    });
  });

  test('can be loaded directly without transpilation', async () => {
    const code = await jest
      .requireActual<FS>('fs')
      .promises.readFile(require.resolve('../worker.js'), 'utf8');
    expect(() => new vm.Script(code)).not.toThrow();
  });
});

describe('jest-worker interface', () => {
  let workerModule: TWorker;

  beforeEach(() => {
    jest.resetModules();
    workerModule = require('../worker');
  });

  test('setup must be called before processFile', () => {
    expect(() => workerModule.processFile(defaults)).toThrow(
      new Error('metro-file-map: setup() must be called before processFile()'),
    );
  });

  test('setup cannot be called twice', () => {
    workerModule.setup({plugins: []});
    expect(() => workerModule.setup({plugins: []})).toThrow(
      new Error('metro-file-map: setup() should only be called once'),
    );
  });

  test('processFile may be called after setup', () => {
    jest.mock('mock-haste-impl', () => {}, {virtual: true});
    workerModule.setup({plugins: []});
    workerModule.processFile(defaults);
  });
});
