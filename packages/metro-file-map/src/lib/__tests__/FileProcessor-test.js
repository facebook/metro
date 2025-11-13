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

import type {
  FileMapPluginWorker,
  FileMetadata,
  WorkerMessage,
  WorkerMetadata,
} from '../../flow-types';

import H from '../../constants';
import path from 'path';

const MockJestWorker = jest.fn().mockImplementation(() => ({
  processFile: async () => ({}),
  end: async () => {},
}));
const mockWorkerFn = jest.fn().mockReturnValue({});

const defaultOptions = {
  dependencyExtractor: null,
  enableWorkerThreads: true,
  maxWorkers: 5,
  perfLogger: null,
  pluginWorkers: [] as $ReadOnlyArray<FileMapPluginWorker>,
  rootDir: process.platform === 'win32' ? 'C:\\root' : '/root',
};

describe('processBatch', () => {
  let FileProcessor;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.mock('jest-worker', () => ({
      Worker: MockJestWorker,
    }));
    jest.mock('../../worker.js', () => ({
      setup: () => {},
      processFile: mockWorkerFn,
      Worker: class {
        processFile: WorkerMessage => WorkerMetadata = mockWorkerFn;
      },
    }));
    FileProcessor = require('../FileProcessor').FileProcessor;
  });

  test('never creates more than maxWorkers', async () => {
    const processor = new FileProcessor({
      ...defaultOptions,
      maxWorkers: 5,
      maxFilesPerWorker: 1,
    });

    await processor.processBatch(getNMockFiles(100), {
      computeDependencies: false,
      computeSha1: true,
      maybeReturnContent: false,
    });

    expect(MockJestWorker).toHaveBeenCalledWith(
      expect.stringContaining('worker.js'),
      expect.objectContaining({
        numWorkers: 5,
      }),
    );
  });

  test('processes in band if workload <= maxFilesPerWorker', async () => {
    const processor = new FileProcessor({
      ...defaultOptions,
      maxWorkers: 5,
      maxFilesPerWorker: 50,
    });

    await processor.processBatch(getNMockFiles(50), {
      computeDependencies: false,
      computeSha1: true,
      maybeReturnContent: false,
    });

    expect(MockJestWorker).not.toHaveBeenCalled();
    expect(mockWorkerFn).toHaveBeenCalledTimes(50);
  });
});

describe('processRegularFile', () => {
  let FileProcessor;
  const mockReadFileSync = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.unmock('../../worker.js');
    jest.mock('fs', () => ({
      readFileSync: mockReadFileSync,
    }));
    FileProcessor = require('../FileProcessor').FileProcessor;
  });

  test('synchronously populates metadata', () => {
    const processor = new FileProcessor(defaultOptions);
    const [normalFilePath, metadata] = getNMockFiles(1)[0];
    expect(metadata[H.SHA1]).toBeFalsy();

    const fileContent = Buffer.from('hello world');
    mockReadFileSync.mockReturnValue(fileContent);

    const result = processor.processRegularFile(normalFilePath, metadata, {
      computeSha1: true,
      computeDependencies: false,
      maybeReturnContent: true,
    });

    expect(mockReadFileSync).toHaveBeenCalledWith(
      path.resolve(defaultOptions.rootDir, normalFilePath),
    );

    expect(result).toEqual({
      content: fileContent,
    });

    expect(metadata[H.SHA1]).toMatch(/^[a-f0-9]{40}$/);
  });
});

function getNMockFiles(numFiles: number): Array<[string, FileMetadata]> {
  return new Array<?[string, FileMetadata]>(numFiles)
    .fill(null)
    .map((_, i) => [
      `file${i}.js`,
      [123, 234, 0, '', null, 0, null] as FileMetadata,
    ]);
}
