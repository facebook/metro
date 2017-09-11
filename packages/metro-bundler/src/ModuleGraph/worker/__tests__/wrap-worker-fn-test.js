/**
 * Copyright (c) 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 * @emails oncall+javascript_foundation
 */

'use strict';

jest.mock('fs', () => jest.genMockFromModule('fs')).mock('mkdirp');

const wrapWorkerFn = require('../wrap-worker-fn');
const {dirname} = require('path');
const {fn} = require('../../test-helpers');

const {any} = jasmine;

describe('wrapWorkerFn:', () => {
  const infile = '/arbitrary/in/file';
  const outfile = '/arbitrary/in/file';

  let workerFn, wrapped;
  beforeEach(() => {
    workerFn = fn();
    wrapped = wrapWorkerFn(workerFn);
  });

  const fs = require('fs');
  const mkdirp = require('mkdirp');

  it('reads the passed-in file synchronously as buffer', () => {
    wrapped(infile, outfile, {});
    expect(fs.readFileSync).toBeCalledWith(infile);
  });

  it('calls the worker function with file contents and options', () => {
    const contents = 'arbitrary(contents);';
    const options = {arbitrary: 'options'};
    fs.readFileSync.mockReturnValue(contents);
    wrapped(infile, outfile, options);
    expect(workerFn).toBeCalledWith(contents, options);
  });

  it('passes through any error that the worker function calls back with', () => {
    const error = new Error();
    workerFn.stub.throws(error);
    try {
      wrapped(infile, outfile, {});
      throw new Error('should not reach');
    } catch (e) {
      expect(e).toBe(error);
    }
  });

  it('writes the result to disk', () => {
    const result = {arbitrary: 'result'};
    workerFn.stub.returns(result);
    wrapped(infile, outfile, {});
    expect(mkdirp.sync).toBeCalledWith(dirname(outfile));
    expect(fs.writeFileSync).toBeCalledWith(
      outfile,
      JSON.stringify(result),
      'utf8',
    );
  });

  it('calls back with any error thrown by `mkdirp.sync`', () => {
    const error = new Error();
    mkdirp.sync.mockImplementationOnce(() => {
      throw error;
    });
    try {
      wrapped(infile, outfile, {});
      throw new Error('should not reach');
    } catch (e) {
      expect(e).toBe(error);
    }
  });

  it('calls back with any error thrown by `fs.writeFileSync`', () => {
    const error = new Error();
    fs.writeFileSync.mockImplementationOnce(() => {
      throw error;
    });
    try {
      wrapped(infile, outfile, {});
      throw new Error('should not reach');
    } catch (e) {
      expect(e).toBe(error);
    }
  });
});
