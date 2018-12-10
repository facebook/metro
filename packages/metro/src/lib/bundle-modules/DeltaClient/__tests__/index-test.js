/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+js_foundation
 * @format
 */

'use strict';

const DeltaClient = require('../');

const bundleToString = require('../bundleToString');

const {
  openDB,
  setBundleMetadata,
  getBundleMetadata,
  removeBundleMetadata,
} = require('../bundleDB');
const {createResponse, getRevisionId} = require('../response');
const {Request, Response, Headers} = require('node-fetch');
const {URL} = require('url');

jest.mock('../bundleDB');

describe('DeltaClient', () => {
  global.URL = URL;
  global.Response = Response;
  global.Request = Request;
  global.Headers = Headers;
  const cacheMock = {
    match: jest.fn(),
    put: jest.fn(),
  };
  global.caches = {
    open: jest.fn(() => cacheMock),
  };

  global.fetch = jest.fn((url, options) => {
    if (options.cache === 'force-cache') {
      if (browserForceCache[url]) {
        return browserForceCache[url];
      }
    } else if (browserCache[url]) {
      return browserCache[url];
    }
    throw new Error(
      `Cache miss: fetch(${JSON.stringify(url)}, ${JSON.stringify(options)})`,
    );
  });

  const dbMock = {};
  openDB.mockResolvedValue(dbMock);

  let browserCache;
  let browserForceCache;
  let bundleCache;
  let metadataDb;

  cacheMock.match.mockImplementation((bundleKey, bundleUrl) =>
    Promise.resolve(bundleCache[bundleKey]),
  );
  cacheMock.put.mockImplementation(
    (bundleUrl, response) =>
      new Promise(resolve => {
        bundleCache[bundleUrl] = response;
        resolve();
      }),
  );

  getBundleMetadata.mockImplementation((db, revisionId) =>
    Promise.resolve(metadataDb[revisionId]),
  );
  setBundleMetadata.mockImplementation(
    (db, revisionId, metadata) =>
      new Promise(resolve => {
        metadataDb[revisionId] = metadata;
        resolve();
      }),
  );

  beforeEach(() => {
    browserCache = {};
    browserForceCache = {};
    bundleCache = {};
    metadataDb = {};

    global.fetch.mockClear();
    cacheMock.match.mockClear();
    cacheMock.put.mockClear();
    getBundleMetadata.mockClear();
    setBundleMetadata.mockClear();
    removeBundleMetadata.mockClear();
  });

  function createDelta(revisionId, added = [], modified = [], deleted = []) {
    return {
      added: added.map(id => [id, `__d("${id.toString()}.${revisionId}");`]),
      modified: modified.map(id => [
        id,
        `__d("${id.toString()}.${revisionId}");`,
      ]),
      deleted,
    };
  }

  function createBundle(revisionId, modules = []) {
    return {
      pre: `pre(${JSON.stringify(revisionId)});`,
      post: `post(${JSON.stringify(revisionId)});`,
      modules: modules.map(id => [
        id,
        `__d("${id.toString()}.${revisionId}");`,
      ]),
    };
  }

  function storeVariantInBrowserCache(variantUrl, revisionId, variant) {
    browserCache[variantUrl] = createResponse(
      JSON.stringify({
        base: variant.pre != null,
        revisionId,
        ...variant,
      }),
      revisionId,
    );
  }

  function storeBundleInCache(
    bundleUrl,
    revisionId,
    bundle,
    cache = bundleCache,
    db = metadataDb,
  ) {
    const {code, metadata} = bundleToString(bundle);
    const response = createResponse(code, revisionId);
    bundleCache[bundleUrl] = response;
    metadataDb[revisionId] = metadata;
  }

  describe('registerBundle', () => {
    const bundleUrl = 'http://localhost/bundles/cool.bundle';
    const metadataUrl = 'http://localhost/bundles/cool.meta?revisionId=rev0';
    const bundle = createBundle('rev0', [0]);
    const {code, metadata} = bundleToString(bundle);

    beforeEach(() => {
      browserCache[metadataUrl] = new Response(JSON.stringify(metadata));
    });

    it('stores an initial bundle response in the bundle cache', async () => {
      const deltaClient = DeltaClient.create();

      const waitUntil = jest.fn();
      deltaClient.registerBundle(
        bundleUrl,
        'rev0',
        new Response(code),
        waitUntil,
      );

      expect(bundleCache[bundleUrl]).not.toBeDefined();

      expect(waitUntil).toHaveBeenCalledTimes(1);
      await waitUntil.mock.calls[0][0];

      expect(bundleCache[bundleUrl]).toBeDefined();
      expect(getRevisionId(bundleCache[bundleUrl])).toBe('rev0');
      expect(await bundleCache[bundleUrl].text()).toMatchInlineSnapshot(`
"pre(\\"rev0\\");
__d(\\"0.rev0\\");
post(\\"rev0\\");"
`);
    });

    it("fetches and stores the bundle's metadata asynchronously", async () => {
      const deltaClient = DeltaClient.create();

      const waitUntil = jest.fn();
      await deltaClient.registerBundle(
        bundleUrl,
        'rev0',
        new Response(code),
        waitUntil,
      );

      expect(metadataDb['rev0']).not.toBeDefined();

      expect(waitUntil).toHaveBeenCalledTimes(1);
      await waitUntil.mock.calls[0][0];

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(metadataDb['rev0']).toEqual(metadata);
    });

    it("doesn't fetch nor update metadata if it is already present in db", async () => {
      browserCache = {};
      metadataDb['rev0'] = metadata;
      const deltaClient = DeltaClient.create();

      const waitUntil = jest.fn();
      await deltaClient.registerBundle(
        bundleUrl,
        'rev0',
        new Response(code),
        waitUntil,
      );

      expect(waitUntil).toHaveBeenCalledTimes(1);
      await waitUntil.mock.calls[0][0];

      expect(global.fetch).not.toHaveBeenCalled();
      expect(setBundleMetadata).not.toHaveBeenCalled();
    });

    it('supports a custom getBundleMetadata function', async () => {
      browserCache = {};
      const getBundleMetadata = jest.fn(() => metadata);
      const deltaClient = DeltaClient.create({getBundleMetadata});

      const waitUntil = jest.fn();
      await deltaClient.registerBundle(
        bundleUrl,
        'rev0',
        new Response(code),
        waitUntil,
      );

      expect(metadataDb['rev0']).not.toBeDefined();

      expect(waitUntil).toHaveBeenCalledTimes(1);
      await waitUntil.mock.calls[0][0];

      expect(getBundleMetadata).toHaveBeenCalledTimes(1);
      expect(metadataDb['rev0']).toEqual(metadata);
    });

    it('returns a response from which a revisionId can be retrieved', async () => {
      const deltaClient = DeltaClient.create();

      const res = deltaClient.registerBundle(
        bundleUrl,
        'rev0',
        new Response(code),
        jest.fn(),
      );

      expect(getRevisionId(res)).toBe('rev0');
      expect(await res.text()).toMatchInlineSnapshot(`
"pre(\\"rev0\\");
__d(\\"0.rev0\\");
post(\\"rev0\\");"
`);
    });
  });

  describe('getBundle', () => {
    it('retrieves a bundle from cache and patches it with a delta bundle', async () => {
      const bundleUrl = 'http://localhost/bundles/cool.bundle';
      const deltaUrl = 'http://localhost/bundles/cool.delta?revisionId=rev0';
      storeBundleInCache(bundleUrl, 'rev0', createBundle('rev0', [0]));
      storeVariantInBrowserCache(
        deltaUrl,
        'rev1',
        createDelta('rev1', [1], [], [0]),
      );

      const deltaClient = DeltaClient.create();

      const res = await deltaClient.getBundle(bundleUrl, 'rev1', jest.fn());

      expect(getRevisionId(res)).toBe('rev1');
      expect(await res.text()).toMatchInlineSnapshot(`
"pre(\\"rev0\\");
__d(\\"1.rev1\\");
post(\\"rev0\\");"
`);
    });

    it('supports a custom getDeltaBundle function', async () => {
      const bundleUrl = 'http://localhost/bundles/cool.bundle';
      storeBundleInCache(bundleUrl, 'rev0', createBundle('rev0', [0]));
      const delta = createDelta('rev2', [2], [], [0]);
      const getDeltaBundle = jest.fn().mockResolvedValue({
        base: false,
        revisionId: 'rev2',
        ...delta,
      });

      const deltaClient = DeltaClient.create({getDeltaBundle});

      const res = await deltaClient.getBundle(bundleUrl, 'rev2', jest.fn());

      expect(getDeltaBundle).toHaveBeenCalledWith(bundleUrl, 'rev0', 'rev2');
      expect(getRevisionId(res)).toBe('rev2');
      expect(await res.text()).toMatchInlineSnapshot(`
"pre(\\"rev0\\");
__d(\\"2.rev2\\");
post(\\"rev0\\");"
`);
    });

    it('supports a custom getBundleMetadata function', async () => {
      const bundleUrl = 'http://localhost/bundles/cool.bundle';
      const deltaUrl = 'http://localhost/bundles/cool.delta?revisionId=rev0';
      storeBundleInCache(bundleUrl, 'rev0', createBundle('rev0', [0]));
      const metadata = metadataDb['rev0'];
      delete metadataDb['rev0'];
      storeVariantInBrowserCache(
        deltaUrl,
        'rev1',
        createDelta('rev1', [1], [], [0]),
      );
      const getBundleMetadata = jest.fn().mockResolvedValue(metadata);

      const deltaClient = DeltaClient.create({getBundleMetadata});

      const waitUntil = jest.fn();
      const res = await deltaClient.getBundle(bundleUrl, 'rev1', waitUntil);

      expect(getBundleMetadata).toHaveBeenCalledWith(bundleUrl, 'rev0');
      expect(getRevisionId(res)).toBe('rev1');
      expect(await res.text()).toMatchInlineSnapshot(`
"pre(\\"rev0\\");
__d(\\"1.rev1\\");
post(\\"rev0\\");"
`);
    });

    it('retrieves a bundle from cache and patches it with a new bundle', async () => {
      const bundleUrl = 'http://localhost/bundles/cool.bundle';
      const deltaUrl = 'http://localhost/bundles/cool.delta?revisionId=rev0';
      storeBundleInCache(bundleUrl, 'rev0', createBundle('rev0', [0]));
      storeVariantInBrowserCache(deltaUrl, 'rev1', createBundle('rev1', [1]));

      const deltaClient = DeltaClient.create();

      const res = await deltaClient.getBundle(bundleUrl, 'rev1', jest.fn());

      expect(getRevisionId(res)).toBe('rev1');
      expect(await res.text()).toMatchInlineSnapshot(`
"pre(\\"rev1\\");
__d(\\"1.rev1\\");
post(\\"rev1\\");"
`);
    });

    it("throws when a previous bundle can't be found in cache", async () => {
      const bundleUrl = 'http://localhost/bundles/cool.bundle';

      const deltaClient = DeltaClient.create();

      let err;
      try {
        await deltaClient.getBundle(bundleUrl, 'revN', jest.fn());
      } catch (error) {
        err = error;
      }

      expect(err).toBeInstanceOf(DeltaClient.BundleNotFoundError);
    });

    it('sets the patched bundle in cache', async () => {
      const bundleUrl = 'http://localhost/bundles/cool.bundle';
      const deltaUrl = 'http://localhost/bundles/cool.delta?revisionId=rev0';
      storeBundleInCache(bundleUrl, 'rev0', createBundle('rev0', [0]));
      storeVariantInBrowserCache(
        deltaUrl,
        'rev1',
        createDelta('rev1', [1], [], [0]),
      );

      const deltaClient = DeltaClient.create();

      const waitUntil = jest.fn();
      await deltaClient.getBundle(bundleUrl, 'rev1', waitUntil);

      expect(waitUntil).toHaveBeenCalledTimes(1);
      await waitUntil.mock.calls[0][0];

      expect(cacheMock.put).toHaveBeenCalled();
      const [bundleKey, response] = cacheMock.put.mock.calls[0];
      expect(bundleKey).toBe(bundleUrl);
      expect(getRevisionId(response)).toBe('rev1');
      expect(await response.text()).toMatchInlineSnapshot(`
"pre(\\"rev0\\");
__d(\\"1.rev1\\");
post(\\"rev0\\");"
`);
    });

    it('sets the patched metadata in cache and clears the previous one', async () => {
      const bundleUrl = 'http://localhost/bundles/cool.bundle';
      const deltaUrl = 'http://localhost/bundles/cool.delta?revisionId=rev0';
      storeBundleInCache(bundleUrl, 'rev0', createBundle('rev0', [0]));
      storeVariantInBrowserCache(
        deltaUrl,
        'rev1',
        createDelta('rev1', [1], [], [0]),
      );

      const deltaClient = DeltaClient.create();

      const waitUntil = jest.fn();
      await deltaClient.getBundle(bundleUrl, 'rev1', waitUntil);

      expect(waitUntil).toHaveBeenCalledTimes(1);
      await waitUntil.mock.calls[0][0];

      expect(setBundleMetadata).toHaveBeenCalledTimes(1);
      expect(removeBundleMetadata).toHaveBeenCalledWith(dbMock, 'rev0');
      expect(setBundleMetadata).toHaveBeenCalledWith(dbMock, 'rev1', {
        modules: [[1, 14]],
        post: 13,
        pre: 12,
      });
    });
  });
});
