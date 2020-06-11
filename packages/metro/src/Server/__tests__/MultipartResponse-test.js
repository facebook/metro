/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+js_foundation
 * @flow
 */

'use strict';

const MultipartResponse = require('../MultipartResponse');

describe('MultipartResponse', () => {
  it('forwards calls to response', () => {
    const nreq = mockNodeRequest({accept: 'text/html'});
    const nres = mockNodeResponse();
    const res = MultipartResponse.wrap(nreq, nres);

    expect(res).toBe(nres);

    res.writeChunk({}, 'foo');
    expect(nres.write).not.toBeCalled();
  });

  it('writes multipart response', () => {
    const nreq = mockNodeRequest({accept: 'multipart/mixed'});
    const nres = mockNodeResponse();
    const res = MultipartResponse.wrap(nreq, nres);

    expect(res).not.toBe(nres);

    res.setHeader('Result-Header-1', 1);
    res.writeChunk({foo: 'bar'}, 'first chunk');
    res.writeChunk({test: 2}, 'second chunk');
    res.writeChunk(null, 'empty headers third chunk');
    res.setHeader('Result-Header-2', 2);
    res.end('Hello, world!');

    expect(nres.toString()).toEqual(
      [
        'HTTP/1.1 200',
        'Content-Type: multipart/mixed; boundary="3beqjf3apnqeu3h5jqorms4i"',
        '',
        'If you are seeing this, your client does not support multipart response',
        '--3beqjf3apnqeu3h5jqorms4i',
        'foo: bar',
        '',
        'first chunk',
        '--3beqjf3apnqeu3h5jqorms4i',
        'test: 2',
        '',
        'second chunk',
        '--3beqjf3apnqeu3h5jqorms4i',
        'empty headers third chunk',
        '--3beqjf3apnqeu3h5jqorms4i',
        'Result-Header-1: 1',
        'Result-Header-2: 2',
        '',
        'Hello, world!',
        '--3beqjf3apnqeu3h5jqorms4i--',
        '',
      ].join('\r\n'),
    );
  });

  it('sends status code as last chunk header', () => {
    const nreq = mockNodeRequest({accept: 'multipart/mixed'});
    const nres = mockNodeResponse();
    const res = MultipartResponse.wrap(nreq, nres);

    res.writeChunk({foo: 'bar'}, 'first chunk');
    res.writeHead(500, {
      'Content-Type': 'application/json; boundary="3beqjf3apnqeu3h5jqorms4i"',
    });
    res.end('{}');

    expect(nres.toString()).toEqual(
      [
        'HTTP/1.1 200',
        'Content-Type: multipart/mixed; boundary="3beqjf3apnqeu3h5jqorms4i"',
        '',
        'If you are seeing this, your client does not support multipart response',
        '--3beqjf3apnqeu3h5jqorms4i',
        'foo: bar',
        '',
        'first chunk',
        '--3beqjf3apnqeu3h5jqorms4i',
        'X-Http-Status: 500',
        'Content-Type: application/json; boundary="3beqjf3apnqeu3h5jqorms4i"',
        '',
        '{}',
        '--3beqjf3apnqeu3h5jqorms4i--',
        '',
      ].join('\r\n'),
    );
  });

  it('supports empty responses', () => {
    const nreq = mockNodeRequest({accept: 'multipart/mixed'});
    const nres = mockNodeResponse();
    const res = MultipartResponse.wrap(nreq, nres);

    res.writeHead(304, {
      'Content-Type': 'application/json; boundary="3beqjf3apnqeu3h5jqorms4i"',
    });
    res.end();

    expect(nres.toString()).toEqual(
      [
        'HTTP/1.1 200',
        'Content-Type: multipart/mixed; boundary="3beqjf3apnqeu3h5jqorms4i"',
        '',
        'If you are seeing this, your client does not support multipart response',
        '--3beqjf3apnqeu3h5jqorms4i',
        'X-Http-Status: 304',
        'Content-Type: application/json; boundary="3beqjf3apnqeu3h5jqorms4i"',
        '',
        '',
        '--3beqjf3apnqeu3h5jqorms4i--',
        '',
      ].join('\r\n'),
    );
  });

  it('passes data directly through to the response object', () => {
    const nreq = mockNodeRequest({accept: 'multipart/mixed'});
    const nres = mockNodeResponse();
    const res = MultipartResponse.wrap(nreq, nres);
    const buffer = Buffer.from([1, 2, 3, 4]);

    res.writeChunk(null, buffer);
    res.end('Hello, world!');
    expect(nres.write).toBeCalledWith(buffer);
  });
});

function mockNodeRequest(headers = {}) {
  return {headers};
}

function mockNodeResponse() {
  let status = 200;
  let headers = {};
  let body = '';
  return {
    writeHead: jest.fn((st, hdrs) => {
      status = st;
      headers = {...headers, ...hdrs};
    }),
    setHeader: jest.fn((key, val) => {
      headers[key] = val;
    }),
    write: jest.fn(data => {
      body += data;
    }),
    end: jest.fn(data => {
      body += data || '';
    }),

    // For testing only
    toString() {
      return [
        `HTTP/1.1 ${status}`,
        MultipartResponse.serializeHeaders(headers),
        '',
        body,
      ].join('\r\n');
    },
  };
}
