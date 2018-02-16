/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails oncall+javascript_foundation
 * @format
 */
'use strict';

jest
  .mock('fs', () => ({writeFileSync: jest.fn()}))
  .mock('temp', () => ({path: () => '/arbitrary/path'}))
  .mock('jest-worker', () => ({__esModule: true, default: jest.fn()}));

const Transformer = require('../');

const {Readable} = require('stream');

describe('Transformer', function() {
  let api, Cache;
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
    Cache = jest.fn();
    Cache.prototype.get = jest.fn((a, b, c) => c());

    const fs = require('fs');
    const jestWorker = require('jest-worker');

    fs.writeFileSync.mockClear();

    jestWorker.default.mockClear();
    jestWorker.default.mockImplementation((workerPath, opts) => {
      api = {
        end: jest.fn(),
        getStdout: () => new Readable({read() {}}),
        getStderr: () => new Readable({read() {}}),
      };

      opts.exposedMethods.forEach(method => {
        api[method] = jest.fn();
      });

      return api;
    });
  });

  it('passes transform data to the worker farm when transforming', () => {
    const transformOptions = {arbitrary: 'options'};
    const code = 'arbitrary(code)';

    new Transformer(opts).transform(
      fileName,
      localPath,
      code,
      false,
      transformOptions,
      [],
      '',
    );

    expect(api.transform).toBeCalledWith(
      fileName,
      localPath,
      code,
      transformModulePath,
      false,
      transformOptions,
      [],
      '',
      'asyncRequire',
      'reject',
    );
  });

  it('should add file info to parse errors', () => {
    const transformer = new Transformer(opts);
    const message = 'message';
    const snippet = 'snippet';

    api.transform.mockImplementation(
      (filename, localPth, code, transformPath, opts) => {
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
