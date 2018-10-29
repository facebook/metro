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

const stringToBundle = require('../stringToBundle');

const {getBundle, setBundle} = require('../bundleCache');
const {Request, Response, Headers} = require('node-fetch');
const {URL} = require('url');

jest.mock('../stringToBundle');

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

  describe('getBundle', () => {
    it('retrieves a bundle from the bundle cache', async () => {
      const bundle = {
        base: true,
        revisionId: 'revId',
        pre: 'pre',
        post: 'post',
        modules: [[0, '0'], [100, '100']],
      };
      const bundleReq = new Request('http://localhost/bundles/cool-bundle');
      matchMock.mockResolvedValue(new Response(JSON.stringify(bundle)));
      expect(await getBundle(bundleReq)).toEqual(bundle);
      expect(fetch).not.toHaveBeenCalled();
      expect(matchMock).toHaveBeenCalledWith(bundleReq);
    });

    it('retrieves a bundle from the browser cache', async () => {
      const stringBundle = 'stringBundle';
      const bundle = {
        base: true,
        revisionId: 'revId',
        pre: 'pre',
        post: 'post',
        modules: [[0, '0'], [100, '100']],
      };
      const bundleReq = new Request('http://localhost/bundles/cool-bundle');
      matchMock.mockResolvedValue(null);
      fetch.mockResolvedValue(new Response(stringBundle));
      stringToBundle.mockReturnValue(bundle);
      expect(await getBundle(bundleReq)).toEqual(bundle);
      expect(fetch).toHaveBeenCalledWith(bundleReq, {cache: 'force-cache'});
      expect(stringToBundle).toHaveBeenCalledWith(stringBundle);
    });

    it('returns null when a bundle cannot be found', async () => {
      matchMock.mockResolvedValue(null);
      fetch.mockResolvedValue(null);
      expect(await getBundle({})).toEqual(null);
    });
  });

  describe('setBundle', () => {
    it('stores a bundle in the bundle cache', async () => {
      const bundle = {
        base: true,
        revisionId: 'revId',
        pre: 'pre',
        post: 'post',
        modules: [[0, '0'], [100, '100']],
      };
      const bundleReq = new Request('http://localhost/bundles/cool-bundle');
      await setBundle(bundleReq, bundle);
      const putCall = putMock.mock.calls[0];
      expect(putCall[0]).toBe(bundleReq);
      expect(await putCall[1].json()).toEqual(bundle);
    });
  });
});
