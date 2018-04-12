/**
 * Copyright (c) 2018-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

const zlib = require('zlib');

const {PassThrough} = require('stream');

describe('HttpStore', () => {
  let HttpStore;
  let httpPassThrough;

  function responseHttpOk(data) {
    const res = Object.assign(new PassThrough(), {
      statusCode: 200,
    });

    process.nextTick(() => {
      res.write(zlib.gzipSync(data));
      res.end();
    });

    return res;
  }

  function responseHttpError(code) {
    return Object.assign(new PassThrough(), {
      statusCode: code,
    });
  }

  function responseError(err) {
    const res = Object.assign(new PassThrough(), {
      statusCode: 200,
    });

    process.nextTick(() => {
      res.emit('error', err);
    });

    return res;
  }

  beforeEach(() => {
    jest
      .resetModules()
      .resetAllMocks()
      .useFakeTimers()
      .mock('http')
      .mock('https');

    httpPassThrough = new PassThrough();
    require('http').request.mockReturnValue(httpPassThrough);
    require('https').request.mockReturnValue(httpPassThrough);

    HttpStore = require('../HttpStore');
  });

  it('works with HTTP and HTTPS', () => {
    const httpStore = new HttpStore({endpoint: 'http://example.com'});
    const httpsStore = new HttpStore({endpoint: 'https://example.com'});

    httpStore.get(Buffer.from('foo'));
    expect(require('http').request).toHaveBeenCalledTimes(1);
    expect(require('https').request).not.toHaveBeenCalled();

    jest.resetAllMocks();

    httpsStore.get(Buffer.from('foo'));
    expect(require('http').request).not.toHaveBeenCalled();
    expect(require('https').request).toHaveBeenCalledTimes(1);
  });

  it('gets using the network via GET method', async () => {
    const store = new HttpStore({endpoint: 'http://www.example.com/endpoint'});
    const promise = store.get(Buffer.from('key'));
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('GET');
    expect(opts.host).toEqual('www.example.com');
    expect(opts.path).toEqual('/endpoint/6b6579');
    expect(opts.timeout).toEqual(5000);

    callback(responseHttpOk(JSON.stringify({foo: 42})));
    jest.runAllTimers();

    expect(await promise).toEqual({foo: 42});
  });

  it('resolves with "null" when HTTP 404 is returned', async () => {
    const store = new HttpStore({endpoint: 'http://example.com'});
    const promise = store.get(Buffer.from('key'));
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('GET');

    callback(responseHttpError(404));
    jest.runAllTimers();

    expect(await promise).toEqual(null);
  });

  it('rejects when an HTTP different of 200/404 is returned', done => {
    const store = new HttpStore({endpoint: 'http://example.com'});
    const promise = store.get(Buffer.from('key'));
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('GET');

    callback(responseHttpError(503)); // Intentionally unterminated JSON.
    jest.runAllTimers();

    promise.catch(err => {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toMatch(/HTTP error: 503/);
      done();
    });
  });

  it('rejects when it gets an invalid JSON response', done => {
    const store = new HttpStore({endpoint: 'http://example.com'});
    const promise = store.get(Buffer.from('key'));
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('GET');

    callback(responseHttpOk('{"foo": 4')); // Intentionally unterminated JSON.
    jest.runAllTimers();

    promise.catch(err => {
      expect(err).toBeInstanceOf(SyntaxError);
      done();
    });
  });

  it('rejects when the HTTP layer throws', done => {
    const store = new HttpStore({endpoint: 'http://example.com'});
    const promise = store.get(Buffer.from('key'));
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('GET');

    callback(responseError(new Error('ENOTFOUND')));
    jest.runAllTimers();

    promise.catch(err => {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('ENOTFOUND');
      done();
    });
  });

  it('sets using the network via PUT method', done => {
    const store = new HttpStore({endpoint: 'http://www.example.com/endpoint'});
    const promise = store.set(Buffer.from('key-set'), {foo: 42});
    const [opts, callback] = require('http').request.mock.calls[0];
    const buf = [];

    expect(opts.method).toEqual('PUT');
    expect(opts.host).toEqual('www.example.com');
    expect(opts.path).toEqual('/endpoint/6b65792d736574');
    expect(opts.timeout).toEqual(5000);

    callback(responseHttpOk(''));

    httpPassThrough.on('data', chunk => {
      buf.push(chunk);
    });

    httpPassThrough.on('end', async () => {
      expect(zlib.gunzipSync(Buffer.concat(buf)).toString()).toBe('{"foo":42}');
      await promise; // Ensure that the setting promise successfully finishes.

      done();
    });
  });

  it('rejects when setting and HTTP fails', done => {
    const store = new HttpStore({endpoint: 'http://example.com'});
    const promise = store.set(Buffer.from('key-set'), {foo: 42});
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('PUT');

    callback(responseError(new Error('ENOTFOUND')));
    jest.runAllTimers();

    promise.catch(err => {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('ENOTFOUND');
      done();
    });
  });
});
