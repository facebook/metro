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
  .mock('worker-farm', () => jest.fn())
  .mock('../../worker-farm', () => jest.fn());

var Transformer = require('../');

const {any} = jasmine;
const {Readable} = require('stream');

describe('Transformer', function() {
  let workers, Cache;
  const fileName = '/an/arbitrary/file.js';
  const localPath = 'arbitrary/file.js';
  const transformModulePath = __filename;

  beforeEach(function() {
    Cache = jest.fn();
    Cache.prototype.get = jest.fn((a, b, c) => c());

    const fs = require('fs');
    const workerFarm = require('../../worker-farm');
    fs.writeFileSync.mockClear();
    workerFarm.mockClear();
    workerFarm.mockImplementation((opts, path, methods) => {
      const api = (workers = {});
      methods.forEach(method => {
        api[method] = jest.fn();
      });
      return {
        methods: api,
        stdout: new Readable({read() {}}),
        stderr: new Readable({read() {}}),
      };
    });
  });

  it(
    'passes transform module path, file path, source code' +
      ' to the worker farm when transforming',
    () => {
      const transformOptions = {arbitrary: 'options'};
      const code = 'arbitrary(code)';
      new Transformer(transformModulePath, 4).transformFile(
        fileName,
        localPath,
        code,
        transformOptions,
      );
      expect(workers.transformAndExtractDependencies).toBeCalledWith(
        transformModulePath,
        fileName,
        localPath,
        code,
        transformOptions,
        any(Function),
      );
    },
  );

  it('should add file info to parse errors', function() {
    const transformer = new Transformer(transformModulePath, 4);
    var message = 'message';
    var snippet = 'snippet';

    workers.transformAndExtractDependencies.mockImplementation(function(
      transformPath,
      filename,
      localPth,
      code,
      opts,
      callback,
    ) {
      var babelError = new SyntaxError(message);
      babelError.type = 'SyntaxError';
      babelError.description = message;
      babelError.loc = {
        line: 2,
        column: 15,
      };
      babelError.codeFrame = snippet;
      callback(babelError);
    });

    expect.assertions(7);
    return transformer
      .transformFile(fileName, localPath, '', {})
      .catch(function(error) {
        expect(error.type).toEqual('TransformError');
        expect(error.message).toBe(
          'SyntaxError in /an/arbitrary/file.js: ' + message,
        );
        expect(error.lineNumber).toBe(2);
        expect(error.column).toBe(15);
        expect(error.filename).toBe(fileName);
        expect(error.description).toBe(message);
        expect(error.snippet).toBe(snippet);
      });
  });
});
