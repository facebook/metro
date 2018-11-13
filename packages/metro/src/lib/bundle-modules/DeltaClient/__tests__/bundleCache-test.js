/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+js_foundation
 * @format
 */

/* eslint-env worker */

'use strict';

const bundleToString = require('../bundleToString');

const {getBundleResponse, setBundleResponse} = require('../bundleCache');
const {Request, Response, Headers} = require('node-fetch');
const {URL} = require('url');

function createResponse(bundle) {
  return new Response(bundleToString(bundle, true), {
    headers: {
      'X-Metro-Delta-ID': bundle.revisionId,
    },
  });
}

describe('bundleCache', () => {
  let putMock;
  let matchMock;
  beforeEach(() => {
    global.fetch = jest.fn();
    putMock = jest.fn();
    matchMock = jest.fn();

    global.URL = URL;
    global.Response = Response;
    global.Request = Request;
    global.Headers = Headers;
    global.caches = {
      open: jest.fn().mockResolvedValue({
        put: putMock,
        match: matchMock,
      }),
    };
  });

  describe('getBundleResponse', () => {
    it('retrieves a bundle response from the bundle cache', async () => {
      const bundle = {
        base: true,
        revisionId: 'revId',
        pre: 'pre',
        post: 'post',
        modules: [[0, '0'], [100, '100']],
      };
      const bundleReq = new Request('http://localhost/bundles/cool-bundle');
      const response = createResponse(bundle);
      matchMock.mockResolvedValue(response);
      expect(await getBundleResponse(bundleReq)).toEqual(response);
      expect(fetch).not.toHaveBeenCalled();
      expect(matchMock).toHaveBeenCalledWith(bundleReq);
    });

    it('retrieves a bundle response from the browser cache', async () => {
      const bundle = {
        base: true,
        revisionId: 'revId',
        pre: 'pre',
        post: 'post',
        modules: [[0, '0'], [100, '100']],
      };
      const bundleReq = new Request('http://localhost/bundles/cool-bundle');
      const response = createResponse(bundle);
      matchMock.mockResolvedValue(null);
      fetch.mockResolvedValue(response);
      expect(await getBundleResponse(bundleReq)).toEqual(response);
      expect(fetch).toHaveBeenCalledWith(bundleReq, {cache: 'force-cache'});
    });

    it('returns null when a bundle response cannot be found', async () => {
      matchMock.mockResolvedValue(null);
      fetch.mockResolvedValue(null);
      expect(await getBundleResponse({})).toEqual(null);
    });
  });

  describe('setBundleResponse', () => {
    it('stores a bundle response in the bundle cache', async () => {
      const bundle = {
        base: true,
        revisionId: 'revId',
        pre: 'pre',
        post: 'post',
        modules: [[0, '0'], [100, '100']],
      };
      const bundleReq = new Request('http://localhost/bundles/cool-bundle');
      const response = createResponse(bundle);
      await setBundleResponse(bundleReq, response);
      expect(putMock).toHaveBeenCalledWith(bundleReq, response);
    });
  });
});
