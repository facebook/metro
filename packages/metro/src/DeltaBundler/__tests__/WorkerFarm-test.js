/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */
'use strict';

const getDefaultConfig = require('metro-config/src/defaults');

const {Readable} = require('stream');

describe('Worker Farm', function() {
  let api;
  let WorkerFarm;
  const fileName = 'arbitrary/file.js';
  const rootFolder = '/root';
  const config = getDefaultConfig();

  const opts = {
    maxWorkers: 4,
    reporter: {},
    transformer: {
      workerPath: null,
    },
  };

  beforeEach(function() {
    jest
      .resetModules()
      .mock('fs', () => ({writeFileSync: jest.fn()}))
      .mock('temp', () => ({path: () => '/arbitrary/path'}))
      .mock('jest-worker', () => ({__esModule: true, default: jest.fn()}));

    const fs = require('fs');
    const jestWorker = require('jest-worker');
    fs.writeFileSync.mockClear();
    jestWorker.default.mockClear();
    jestWorker.default.mockImplementation(function(workerPath, opts) {
      api = {
        end: jest.fn(),
        getStdout: () => new Readable({read() {}}),
        getStderr: () => new Readable({read() {}}),
      };

      opts.exposedMethods.forEach(method => {
        api[method] = jest.fn();
      });

      api.transform.mockImplementation(() => {
        return {
          result: 'transformed(code)',
          sha1: '4ea962697c876e2674d107f0fec6798414f5bf45',
          transformFileStartLogEntry: {},
          transformFileEndLogEntry: {},
        };
      });

      return api;
    });

    WorkerFarm = require('../WorkerFarm');
  });

  it('passes transform data to the worker farm when transforming', async () => {
    const transformOptions = {arbitrary: 'options'};

    await new WorkerFarm(opts).transform(
      fileName,
      rootFolder,
      config.transformerPath,
      transformOptions,
    );

    expect(api.transform).toBeCalledWith(
      fileName,
      rootFolder,
      config.transformerPath,
      transformOptions,
    );
  });

  it('should add file info to parse errors', () => {
    const workerFarm = new WorkerFarm(opts);
    const message = 'message';
    const snippet = 'snippet';

    api.transform.mockImplementation((filename, transformPath, opts) => {
      const babelError = new SyntaxError(message);

      babelError.type = 'SyntaxError';
      babelError.loc = {line: 2, column: 15};
      babelError.codeFrame = snippet;

      return Promise.reject(babelError);
    });

    expect.assertions(6);

    return workerFarm
      .transform(fileName, rootFolder, '', {})
      .catch(function(error) {
        expect(error.type).toEqual('TransformError');
        expect(error.message).toBe(
          'SyntaxError in arbitrary/file.js: ' + message,
        );
        expect(error.lineNumber).toBe(2);
        expect(error.column).toBe(15);
        expect(error.filename).toBe(fileName);
        expect(error.snippet).toBe(snippet);
      });
  });
});
