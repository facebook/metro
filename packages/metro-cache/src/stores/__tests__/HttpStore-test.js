/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
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

  it('rejects when an HTTP different from 200 is returned', done => {
    const store = new HttpStore({endpoint: 'http://example.com'});
    const promise = store.get(Buffer.from('key'));
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('GET');

    callback(responseHttpError(503));
    jest.runAllTimers();

    promise.catch(err => {
      expect(err).toBeInstanceOf(HttpStore.HttpError);
      expect(err.message).toMatch(/HTTP error: 503/);
      expect(err.code).toBe(503);
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

  it('rejects when setting and HTTP returns an error response', done => {
    const store = new HttpStore({endpoint: 'http://example.com'});
    const promise = store.set(Buffer.from('key-set'), {foo: 42});
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('PUT');

    callback(responseHttpError(403));
    jest.runAllTimers();

    promise.catch(err => {
      expect(err).toBeInstanceOf(HttpStore.HttpError);
      expect(err.message).toMatch(/HTTP error: 403/);
      expect(err.code).toBe(403);
      done();
    });
  });

  it('gets the same value that was set', async () => {
    const store = new HttpStore({endpoint: 'http://www.example.com/endpoint'});
    const chunks = [];
    let storedValue;

    httpPassThrough.on('data', chunk => {
      chunks.push(chunk);
    });

    httpPassThrough.on('end', () => {
      storedValue = zlib.gunzipSync(Buffer.concat(chunks));

      const callbackSet = require('http').request.mock.calls[0][1];

      callbackSet(responseHttpOk(''));
    });

    await store.set(Buffer.from('key-set'), {foo: 42});

    const promiseGet = store.get(Buffer.from('key-set'));
    const callbackGet = require('http').request.mock.calls[1][1];

    callbackGet(responseHttpOk(storedValue));

    expect(await promiseGet).toEqual({foo: 42});
  });

  it('gets the same value that was set when storing buffers', async () => {
    const store = new HttpStore({endpoint: 'http://www.example.com/endpoint'});
    const chunks = [];
    let storedValue;

    httpPassThrough.on('data', chunk => {
      chunks.push(chunk);
    });

    httpPassThrough.on('end', () => {
      storedValue = zlib.gunzipSync(Buffer.concat(chunks));

      const callbackSet = require('http').request.mock.calls[0][1];

      callbackSet(responseHttpOk(''));
    });

    const bufferValue = Buffer.from([0xfb, 0xca, 0xc4]);

    await store.set(Buffer.from('key-set'), bufferValue);

    const promiseGet = store.get(Buffer.from('key-set'));
    const callbackGet = require('http').request.mock.calls[1][1];

    callbackGet(responseHttpOk(storedValue));

    expect(await promiseGet).toEqual(bufferValue);
  });
});
