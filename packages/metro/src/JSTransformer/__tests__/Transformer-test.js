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

const defaults = require('metro-config/src/defaults/defaults');

const {Readable} = require('stream');

describe('Transformer', function() {
  let api;
  let Transformer;
  const fileName = '/an/arbitrary/file.js';
  const localPath = 'arbitrary/file.js';
  const transformModulePath = __filename;

  const opts = {
    asyncRequireModulePath: 'asyncRequire',
    maxWorkers: 4,
    reporters: {},
    transformModulePath,
    dynamicDepsInPackages: 'reject',
    workerPath: null,
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

    Transformer = require('../');
  });

  it('passes transform data to the worker farm when transforming', async () => {
    const transformOptions = {arbitrary: 'options'};

    await new Transformer(opts).transform(
      fileName,
      localPath,
      transformOptions,
      [],
      '',
      defaults.DEFAULT_METRO_MINIFIER_PATH,
    );

    expect(api.transform).toBeCalledWith(
      fileName,
      localPath,
      transformModulePath,
      transformOptions,
      [],
      '',
      defaults.DEFAULT_METRO_MINIFIER_PATH,
      'asyncRequire',
      'reject',
    );
  });

  it('should add file info to parse errors', () => {
    const transformer = new Transformer(opts);
    const message = 'message';
    const snippet = 'snippet';

    api.transform.mockImplementation(
      (filename, localPth, transformPath, opts) => {
        const babelError = new SyntaxError(message);

        babelError.type = 'SyntaxError';
        babelError.loc = {line: 2, column: 15};
        babelError.codeFrame = snippet;

        return Promise.reject(babelError);
      },
    );

    expect.assertions(6);

    return transformer
      .transform(fileName, localPath, '', true, {})
      .catch(function(error) {
        expect(error.type).toEqual('TransformError');
        expect(error.message).toBe(
          'SyntaxError in /an/arbitrary/file.js: ' + message,
        );
        expect(error.lineNumber).toBe(2);
        expect(error.column).toBe(15);
        expect(error.filename).toBe(fileName);
        expect(error.snippet).toBe(snippet);
      });
  });
});
