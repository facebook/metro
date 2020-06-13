/**
 * (c) Facebook, Inc. and its affiliates. Confidential and proprietary.
 *
 * @emails oncall+react_native
 * @format
 */

'use strict';

const zlib = require('zlib');

const {PassThrough} = require('stream');

describe('HttpGetStore', () => {
  let HttpGetStore;
  let httpPassThrough;
  let warningMessages;

  function responseHttpError(code) {
    return Object.assign(new PassThrough(), {
      statusCode: code,
    });
  }

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

  beforeEach(() => {
    jest
      .resetModules()
      .resetAllMocks()
      .useFakeTimers()
      .mock('http');

    httpPassThrough = new PassThrough();
    require('http').request.mockReturnValue(httpPassThrough);

    HttpGetStore = require('../HttpGetStore');

    warningMessages = [];

    process.emitWarning = jest.fn(warn => {
      warningMessages.push(warn);
    });
  });

  it("doesn't throw any error for http 200 status code", async () => {
    const store = new HttpGetStore({
      endpoint: 'http://www.example.com/endpoint',
    });
    const promise = store.get(Buffer.from('key'));
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('GET');
    expect(opts.host).toEqual('www.example.com');
    expect(opts.path).toEqual('/endpoint/6b6579');
    expect(opts.timeout).toEqual(5000);

    callback(responseHttpOk(JSON.stringify({foo: 42})));
    jest.runAllTimers();

    expect(await promise).toEqual({foo: 42});
    expect(warningMessages.length).toBe(0);
  });

  it("doesn't throw any error and doesn't warn on http status 404 errors", async () => {
    const store = new HttpGetStore({endpoint: 'http://example.com'});
    const promise = store.get(Buffer.from('key'));
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('GET');

    callback(responseHttpError(404)); // Page not found

    await promise.then(result => {
      expect(result).toBe(null);

      expect(warningMessages.length).toBe(0);
    });
  });

  it("doesn't throw any error and warns on http status 502 errors", async () => {
    const store = new HttpGetStore({endpoint: 'http://example.com'});
    const promise = store.get(Buffer.from('key'));
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('GET');

    callback(responseHttpError(502)); // Server error

    await promise.then(result => {
      expect(result).toBe(null);

      expect(warningMessages.length).toBe(1);
      expect(warningMessages[0]).toMatchInlineSnapshot(
        '"Could not connect to the HTTP cache. Original error: HTTP error: 502"',
      );
    });
  });
});
