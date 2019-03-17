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

const DeltaClient = require('../dev');
const WebSocketHMRClient = require('../../WebSocketHMRClient');

const bundleToString = require('../bundleToString');

const {
  openDB,
  getBundleMetadata,
  setBundleMetadata,
  removeBundleMetadata,
} = require('../bundleDB');
const {createResponse} = require('../response');
const {Request, Response, Headers} = require('node-fetch');
const {URL} = require('url');

jest.mock('../bundleDB');
jest.mock('../../WebSocketHMRClient');

function createUpdate(rev, added = [], modified = [], deleted = []) {
  return {
    revisionId: rev,
    added: added.map(i => [i, `__d("${i}.${rev}");`]),
    modified: modified.map(i => [i, `__d("${i}.${rev}");`]),
    deleted,
    addedSourceMappingURLs: [],
    addedSourceURLs: [],
    modifiedSourceMappingURLs: [],
    modifiedSourceURLs: [],
  };
}

describe('DeltaClient/dev', () => {
  global.URL = URL;
  global.Response = Response;
  global.Request = Request;
  global.Headers = Headers;
  global.fetch = jest.fn();
  const cacheMock = {
    match: jest.fn(),
    put: jest.fn(),
  };
  global.caches = {
    open: jest.fn(() => cacheMock),
  };

  const bundleUrl = 'http://localhost/bundles/cool.bundle';

  const {code, metadata} = bundleToString({
    pre: 'pre("rev0");',
    post: 'post("rev0");',
    modules: [[0, '__d("0.rev0");']],
  });

  const dbMock = {};
  const response = createResponse(code, 'rev0');
  cacheMock.match.mockImplementation(() => Promise.resolve(response.clone()));
  getBundleMetadata.mockResolvedValue(metadata);
  openDB.mockResolvedValue(dbMock);

  beforeEach(() => {
    global.fetch.mockClear();
    cacheMock.match.mockClear();
    cacheMock.put.mockClear();
    getBundleMetadata.mockClear();
    setBundleMetadata.mockClear();
    removeBundleMetadata.mockClear();
  });

  const flushPromises = async () =>
    await new Promise(resolve => setImmediate(resolve));

  const emit = (name, ...args) => {
    WebSocketHMRClient.prototype.on.mock.calls
      .filter(call => call[0] === name)
      .map(call => call[1](...args));
  };

  const postMessage = jest.fn();
  global.clients = {
    get: jest.fn().mockResolvedValue({
      postMessage,
    }),
  };

  beforeEach(() => {
    global.clients.get.mockClear();
    postMessage.mockClear();
    WebSocketHMRClient.mockClear();
    WebSocketHMRClient.prototype.on.mockClear();
  });

  describe('registerBundle', () => {
    it('sets up the HMR client', async () => {
      const deltaClient = DeltaClient.create();
      deltaClient.registerBundle(bundleUrl, response, 'client0');

      await flushPromises();

      expect(WebSocketHMRClient).toHaveBeenCalledWith(
        'ws://localhost/hot?revisionId=rev0',
      );
    });

    it('sets up the HMR client (HTTPS)', async () => {
      const deltaClient = DeltaClient.create();
      deltaClient.registerBundle(
        'https://localhost/bundles/cool.bundle',
        response,
        'client0',
      );

      await flushPromises();

      expect(WebSocketHMRClient).toHaveBeenCalledWith(
        'wss://localhost/hot?revisionId=rev0',
      );
    });

    it('accepts a custom getHmrServerUrl function', async () => {
      const getHmrServerUrl = jest.fn().mockReturnValue('ws://whatever');
      const deltaClient = DeltaClient.create({getHmrServerUrl});

      deltaClient.registerBundle(bundleUrl, response, 'client0');
      await flushPromises();

      expect(getHmrServerUrl).toHaveBeenCalledWith(
        'http://localhost/bundles/cool.bundle',
        'rev0',
      );
      expect(WebSocketHMRClient).toHaveBeenCalledWith('ws://whatever');
    });

    it('sets the initial response in cache', async () => {
      const deltaClient = DeltaClient.create();

      deltaClient.registerBundle(bundleUrl, response, 'client0');
      await flushPromises();

      expect(cacheMock.put).toHaveBeenCalledTimes(1);
      const [bundleKey, bundleRes] = cacheMock.put.mock.calls[0];
      expect(bundleKey).toBe(bundleUrl);
      expect(bundleRes.headers.get('X-Metro-Delta-ID')).toBe('rev0');
      expect(await bundleRes.text()).toBe(await response.clone().text());
    });
  });

  describe('getBundle', () => {
    it('retrieves a bundle from cache and patches it with the initial update', async () => {
      const deltaClient = DeltaClient.create();
      const promise = deltaClient.getBundle(bundleUrl, 'client0');

      await flushPromises();

      emit('open');
      emit('update-start');
      emit('update', createUpdate('rev1', [1], [], [0]));
      emit('update-done');

      const response2 = await promise;

      expect(cacheMock.put).toHaveBeenCalledTimes(1);
      const [bundleKey, bundleRes] = cacheMock.put.mock.calls[0];
      expect(bundleKey).toEqual('http://localhost/bundles/cool.bundle');
      const responseText = await bundleRes.clone().text();
      expect(await response2.text()).toBe(responseText);
      expect(responseText).toMatchInlineSnapshot(`
"pre(\\"rev0\\");
__d(\\"1.rev1\\");
post(\\"rev0\\");"
`);

      expect(setBundleMetadata).toHaveBeenCalledWith(dbMock, 'rev1', {
        modules: [[1, 14]],
        post: 13,
        pre: 12,
      });
    });

    it('sends an update message to clients', async () => {
      const deltaClient = DeltaClient.create();
      deltaClient.getBundle(bundleUrl, 'client0');

      await flushPromises();

      emit('open');
      emit('update-start');
      emit('update', createUpdate('rev0'));
      emit('update-done');

      const update = createUpdate('rev1', [1], [], [0]);
      emit('update-start');
      emit('update', update);
      emit('update-done');

      expect(global.clients.get).toHaveBeenCalledWith('client0');

      await flushPromises();

      expect(postMessage).toHaveBeenCalledWith({
        type: 'METRO_UPDATE',
        update,
      });
    });

    it('sends an update start message to clients', async () => {
      const deltaClient = DeltaClient.create();
      deltaClient.getBundle(bundleUrl, 'client0');

      await flushPromises();

      emit('open');
      emit('update-start');
      emit('update', createUpdate('rev0'));
      emit('update-done');

      emit('update-start');

      expect(global.clients.get).toHaveBeenCalledWith('client0');

      await flushPromises();

      expect(postMessage).toHaveBeenCalledWith({
        type: 'METRO_UPDATE_START',
      });
    });

    it('sends an update error message to clients', async () => {
      const deltaClient = DeltaClient.create();
      deltaClient.getBundle(bundleUrl, 'client0');

      await flushPromises();

      emit('open');
      emit('update-start');
      emit('update', createUpdate('rev0'));
      emit('update-done');

      const error = {
        type: 'CompleteFailureError',
        message: 'Everything went south',
        errors: [],
      };
      emit('update-start');
      emit('error', error);

      expect(global.clients.get).toHaveBeenCalledWith('client0');

      await flushPromises();

      expect(postMessage).toHaveBeenCalledWith({
        type: 'METRO_UPDATE_ERROR',
        error,
      });
    });

    it('patches the cached bundle on later update', async () => {
      const deltaClient = DeltaClient.create();
      deltaClient.getBundle(bundleUrl, 'client0');

      await flushPromises();

      emit('open');
      emit('update-start');
      emit('update', createUpdate('rev0'));
      emit('update-done');

      const update = createUpdate('rev1', [1], [], [0]);
      emit('update-start');
      emit('update', update);
      emit('update-done');

      await flushPromises();

      expect(cacheMock.put).toHaveBeenCalledTimes(1);
      const [bundleKey, bundleRes] = cacheMock.put.mock.calls[0];
      expect(bundleKey).toEqual('http://localhost/bundles/cool.bundle');
      const responseText = await bundleRes.clone().text();
      expect(responseText).toMatchInlineSnapshot(`
"pre(\\"rev0\\");
__d(\\"1.rev1\\");
post(\\"rev0\\");"
`);
    });

    it('accepts a custom onUpdate function', async () => {
      const onUpdate = jest.fn();
      const deltaClient = DeltaClient.create({onUpdate});
      deltaClient.getBundle(bundleUrl, 'client0');

      await flushPromises();

      emit('open');
      emit('update-start');
      emit('update', createUpdate('rev0'));
      emit('update-done');

      const update = createUpdate('rev1', [1], [], [0]);
      emit('update-start');
      emit('update', update);
      emit('update-done');

      expect(onUpdate).toHaveBeenCalledWith('client0', update);
    });

    it('accepts a custom onUpdateStart function', async () => {
      const onUpdateStart = jest.fn();
      const deltaClient = DeltaClient.create({onUpdateStart});
      deltaClient.getBundle(bundleUrl, 'client0');

      await flushPromises();

      emit('open');
      emit('update-start');
      emit('update', createUpdate('rev0'));
      emit('update-done');

      emit('update-start');

      expect(onUpdateStart).toHaveBeenCalledWith('client0');
    });

    it('accepts a custom onUpdateError function', async () => {
      const onUpdateError = jest.fn();
      const deltaClient = DeltaClient.create({onUpdateError});
      deltaClient.getBundle(bundleUrl, 'client0');

      await flushPromises();

      emit('open');
      emit('update-start');
      emit('update', createUpdate('rev0'));
      emit('update-done');

      const error = {
        type: 'CompleteFailureError',
        message: 'Everything went south',
        errors: [],
      };
      emit('update-start');
      emit('error', error);

      expect(onUpdateError).toHaveBeenCalledWith('client0', error);
    });

    it('only connects once for a given bundle/revisionId', async () => {
      const onUpdate = jest.fn();
      const deltaClient = DeltaClient.create({onUpdate});
      deltaClient.getBundle(bundleUrl, 'client0');

      await flushPromises();

      deltaClient.getBundle(bundleUrl, 'client1');

      await flushPromises();

      emit('open');
      emit('update-start');
      emit('update', createUpdate('rev0'));
      emit('update-done');

      const update = createUpdate('rev1', [1], [], [0]);
      emit('update-start');
      emit('update', update);
      emit('update-done');

      expect(WebSocketHMRClient).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenNthCalledWith(1, 'client0', update);
      expect(onUpdate).toHaveBeenNthCalledWith(2, 'client1', update);
    });

    it('can serve multiple clients at the same time', async () => {
      const onUpdate = jest.fn();
      const deltaClient = DeltaClient.create({onUpdate});
      const promise1 = deltaClient.getBundle(bundleUrl, 'client0');
      const promise2 = deltaClient.getBundle(bundleUrl, 'client1');

      await flushPromises();

      emit('open');
      emit('update-start');
      emit('update', createUpdate('rev0'));
      emit('update-done');

      const response1 = await promise1;
      const response2 = await promise2;
      const text1 = await response1.text();
      expect(text1).toMatchInlineSnapshot(`
"pre(\\"rev0\\");
__d(\\"0.rev0\\");
post(\\"rev0\\");"
`);
      expect(await response2.text()).toEqual(text1);
    });

    it('reconnects when a new request comes in', async () => {
      const deltaClient = DeltaClient.create();
      deltaClient.getBundle(bundleUrl, 'client0');

      await flushPromises();

      expect(WebSocketHMRClient).toHaveBeenCalledTimes(1);

      emit('close');

      deltaClient.getBundle(bundleUrl, 'client1');

      await flushPromises();

      emit('close');

      expect(WebSocketHMRClient).toHaveBeenCalledTimes(2);
    });

    it('connection errors bubble up', async () => {
      const deltaClient = DeltaClient.create();
      const promise = deltaClient.getBundle(bundleUrl, 'client0');

      await flushPromises();

      emit('connection-error', new Error('Oh no! An error was thrown!'));

      expect(promise).rejects.toThrowErrorMatchingInlineSnapshot(
        '"Error retrieving an initial update for the bundle `http://localhost/bundles/cool.bundle`."',
      );
    });
  });
});
