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

import type {FileMetaData} from '../../flow-types';

const MockJestWorker = jest.fn().mockImplementation(() => ({
  worker: async () => ({}),
}));
const mockWorkerFn = jest.fn().mockResolvedValue({});

describe('processBatch', () => {
  const defaultOptions = {
    dependencyExtractor: null,
    enableHastePackages: false,
    enableWorkerThreads: true,
    hasteImplModulePath: null,
    maxWorkers: 5,
    perfLogger: null,
  };

  let FileProcessor;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.mock('jest-worker', () => ({
      Worker: MockJestWorker,
    }));
    jest.mock('../../worker.js', () => ({
      worker: mockWorkerFn,
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
    });

    expect(MockJestWorker).not.toHaveBeenCalled();
    expect(mockWorkerFn).toHaveBeenCalledTimes(50);
  });
});

function getNMockFiles(numFiles: number): Array<[string, FileMetaData]> {
  return new Array<?[string, FileMetaData]>(numFiles)
    .fill(null)
    .map((_, i) => [
      `file${i}.js`,
      ['', 123, 234, 0, '', '', 0] as FileMetaData,
    ]);
}
