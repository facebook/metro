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

const WebSocketHMRClient = require('../../WebSocketHMRClient');

const bundleToString = require('../bundleToString');
const createDeltaClient = require('../createDeltaClient');

const {getBundleResponse, setBundleResponse} = require('../bundleCache');
const {Request, Response, Headers} = require('node-fetch');
const {URL} = require('url');

jest.mock('../bundleCache');
jest.mock('../../WebSocketHMRClient');

function createBundle(revisionId, modules = []) {
  return {
    base: true,
    revisionId,
    pre: `pre(${JSON.stringify(revisionId)});`,
    post: `post(${JSON.stringify(revisionId)});`,
    modules: modules.map(id => [id, `__d(${id.toString()});`]),
  };
}

function createDelta(revisionId, modules = [], deleted = []) {
  return {
    base: false,
    revisionId,
    modules: modules.map(id => [id, `__d(${id.toString()});`]),
    deleted,
  };
}

function createResponse(bundle) {
  return new Response(bundleToString(bundle, true), {
    headers: {
      'X-Metro-Delta-ID': bundle.revisionId,
    },
  });
}

describe('createDeltaClient', () => {
  let fetch;
  beforeEach(() => {
    global.__DEV__ = false;
    fetch = global.fetch = jest.fn();
    global.URL = URL;
    global.Response = Response;
    global.Request = Request;
    global.Headers = Headers;
    console.error = jest.fn();
    getBundleResponse.mockReset();
    setBundleResponse.mockReset();
  });

  it('retrieves a bundle from cache and patches it with a delta bundle', async () => {
    const bundle = createBundle('0', [0]);
    const delta = createDelta('1', [1], [0]);
    getBundleResponse.mockResolvedValue(createResponse(bundle));
    fetch.mockResolvedValue(new Response(JSON.stringify(delta)));
    const deltaClient = createDeltaClient();

    const bundleReq = new Request('http://localhost/bundles/cool.bundle');
    const res = await deltaClient({
      clientId: 'clientId',
      request: bundleReq,
    });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost/bundles/cool.delta?revisionId=0',
      {
        includeCredentials: true,
      },
    );
    expect(await res.text()).toMatchInlineSnapshot(`
"pre(\\"0\\");
__d(1);
post(\\"0\\");
//# offsetTable={\\"revisionId\\":\\"1\\",\\"pre\\":9,\\"post\\":10,\\"modules\\":[[1,7]]}"
`);
  });

  it('supports a custom getDeltaBundle function', async () => {
    const bundle = createBundle('rev0', [0]);
    const delta = createDelta('rev2', [2], [0]);
    const response = createResponse(bundle);
    getBundleResponse.mockResolvedValue(response);
    const getDeltaBundle = jest.fn().mockResolvedValue(delta);
    const deltaClient = createDeltaClient({getDeltaBundle});

    const bundleReq = new Request('http://localhost/bundles/cool.bundle');
    const res = await deltaClient({
      clientId: 'clientId',
      request: bundleReq,
    });

    expect(getDeltaBundle).toHaveBeenCalledWith(bundleReq, response);
    expect(await res.text()).toMatchInlineSnapshot(`
"pre(\\"rev0\\");
__d(2);
post(\\"rev0\\");
//# offsetTable={\\"revisionId\\":\\"rev2\\",\\"pre\\":12,\\"post\\":13,\\"modules\\":[[2,7]]}"
`);
  });

  it('supports a custom shouldUpdateBundle function', async () => {
    const bundle = createBundle('rev0', [0]);
    const delta = createDelta('rev2', [2], [0]);
    const response = createResponse(bundle);
    getBundleResponse.mockResolvedValue(response);
    fetch.mockResolvedValue(new Response(JSON.stringify(delta)));
    const shouldUpdateBundle = jest.fn().mockReturnValue(false);
    const deltaClient = createDeltaClient({shouldUpdateBundle});

    const bundleReq = new Request('http://localhost/bundles/cool.bundle');
    const res = await deltaClient({
      clientId: 'clientId',
      request: bundleReq,
    });

    expect(shouldUpdateBundle).toHaveBeenCalledWith(bundleReq, response, delta);
    expect(await res.text()).toMatchInlineSnapshot(`
"pre(\\"rev0\\");
__d(0);
post(\\"rev0\\");
//# offsetTable={\\"revisionId\\":\\"rev0\\",\\"pre\\":12,\\"post\\":13,\\"modules\\":[[0,7]]}"
`);
  });

  it('retrieves a bundle from cache and patches it with a new bundle', async () => {
    const bundle = createBundle('rev0', [0]);
    const newBundle = createBundle('rev1', [1]);
    getBundleResponse.mockResolvedValue(createResponse(bundle));
    fetch.mockResolvedValue(new Response(JSON.stringify(newBundle)));
    const deltaClient = createDeltaClient();

    const bundleReq = new Request('http://localhost/bundles/cool.bundle');
    const res = await deltaClient({
      clientId: 'clientId',
      request: bundleReq,
    });

    expect(getBundleResponse).toHaveBeenCalledWith(bundleReq);
    expect(await res.text()).toMatchInlineSnapshot(`
"pre(\\"rev1\\");
__d(1);
post(\\"rev1\\");
//# offsetTable={\\"revisionId\\":\\"rev1\\",\\"pre\\":12,\\"post\\":13,\\"modules\\":[[1,7]]}"
`);
  });

  it('errors from fetch bubble up', async () => {
    const bundle = createBundle('rev0', [0]);
    const error = new Error('Fetch error');
    getBundleResponse.mockResolvedValue(createResponse(bundle));
    fetch.mockRejectedValueOnce(error);
    const deltaClient = createDeltaClient();

    const bundleReq = new Request('http://localhost/bundles/cool.bundle');
    expect(
      deltaClient({
        clientId: 'clientId',
        request: bundleReq,
      }),
    ).rejects.toBe(error);
  });

  it("throws when a previous bundle can't be found in cache", async () => {
    getBundleResponse.mockResolvedValue(null);
    const deltaClient = createDeltaClient();

    const bundleReq = new Request('http://localhost/bundles/cool.bundle');
    expect(
      deltaClient({
        clientId: 'clientId',
        request: bundleReq,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      '"Couldn\'t retrieve a bundle corresponding to http://localhost/bundles/cool.bundle from neither the bundle cache nor the browser cache. This can happen when the browser cache is cleared but the service worker isn\'t."',
    );
  });

  it('sets the patched bundle in cache', async () => {
    const bundle = createBundle('rev0', [0]);
    const delta = createDelta('rev1', [1], [0]);
    const response = createResponse(bundle);
    getBundleResponse.mockResolvedValue(response);
    fetch.mockResolvedValue(new Response(JSON.stringify(delta)));
    const deltaClient = createDeltaClient();

    const bundleReq = new Request('http://localhost/bundles/cool.bundle');
    await deltaClient({
      clientId: 'clientId',
      request: bundleReq,
    });

    expect(setBundleResponse).toHaveBeenCalledTimes(1);
    expect(setBundleResponse.mock.calls[0][0]).toEqual(bundleReq);
    expect(await setBundleResponse.mock.calls[0][1].text())
      .toMatchInlineSnapshot(`
"pre(\\"rev0\\");
__d(1);
post(\\"rev0\\");
//# offsetTable={\\"revisionId\\":\\"rev1\\",\\"pre\\":12,\\"post\\":13,\\"modules\\":[[1,7]]}"
`);
  });

  describe('Updates', () => {
    const flushPromises = async () =>
      await new Promise(resolve => setImmediate(resolve));

    const emit = (name, ...args) => {
      WebSocketHMRClient.prototype.on.mock.calls
        .filter(call => call[0] === name)
        .map(call => call[1](...args));
    };

    let response;
    beforeEach(() => {
      global.__DEV__ = true;
      global.clients = {
        get: jest.fn().mockResolvedValue({
          postMessage: jest.fn(),
        }),
      };
      const bundle = createBundle('rev0', [0]);
      response = createResponse(bundle);
      getBundleResponse.mockResolvedValue(response);
      WebSocketHMRClient.prototype.on.mockClear();
      WebSocketHMRClient.mockClear();
    });

    it('sets up the HMR client', async () => {
      const deltaClient = createDeltaClient();

      deltaClient({
        clientId: 'client0',
        request: new Request('http://localhost/bundles/cool.bundle'),
      });

      await flushPromises();

      expect(WebSocketHMRClient).toHaveBeenCalledWith(
        'ws://localhost/hot?revisionId=rev0',
      );
    });

    it('sets up the HMR client (HTTPS)', async () => {
      const deltaClient = createDeltaClient();

      deltaClient({
        clientId: 'client0',
        request: new Request('https://localhost/bundles/cool.bundle'),
      });

      await flushPromises();

      expect(WebSocketHMRClient).toHaveBeenCalledWith(
        'wss://localhost/hot?revisionId=rev0',
      );
    });

    it('accepts a custom getHmrServerUrl function', async () => {
      const getHmrServerUrl = jest.fn().mockReturnValue('ws://whatever');
      const deltaClient = createDeltaClient({getHmrServerUrl});

      const bundleReq = new Request('https://localhost/bundles/cool.bundle');

      deltaClient({
        clientId: 'client0',
        request: bundleReq,
      });

      await flushPromises();

      expect(getHmrServerUrl).toHaveBeenCalledWith(bundleReq, response);
      expect(WebSocketHMRClient).toHaveBeenCalledWith('ws://whatever');
    });

    it('retrieves a bundle from cache and patches it with the initial update', async () => {
      const deltaClient = createDeltaClient();

      const bundleReq = new Request('https://localhost/bundles/cool.bundle');
      const promise = deltaClient({
        clientId: 'client0',
        request: bundleReq,
      });

      await flushPromises();

      emit('open');
      emit('update-start');
      emit('update', {
        revisionId: 'rev1',
        modules: [[1, '0.1']],
        deleted: [0],
        sourceMappingURLs: [],
        sourceURLs: [],
      });
      emit('update-done');

      const response2 = await promise;

      expect(setBundleResponse).toHaveBeenCalledTimes(1);
      expect(setBundleResponse.mock.calls[0][0]).toEqual(bundleReq);
      const responseText = await setBundleResponse.mock.calls[0][1]
        .clone()
        .text();
      expect(await response2.text()).toBe(responseText);
      expect(responseText).toMatchInlineSnapshot(`
"pre(\\"rev0\\");
0.1
post(\\"rev0\\");
//# offsetTable={\\"revisionId\\":\\"rev1\\",\\"pre\\":12,\\"post\\":13,\\"modules\\":[[1,3]]}"
`);
    });

    it('sends an update message to clients', async () => {
      const clientMock = {
        postMessage: jest.fn(),
      };
      global.clients = {
        get: jest.fn().mockResolvedValue(clientMock),
      };
      const deltaClient = createDeltaClient();

      deltaClient({
        clientId: 'client0',
        request: new Request('https://localhost/bundles/cool.bundle'),
      });

      await flushPromises();

      emit('open');
      emit('update-start');
      emit('update', {
        revisionId: 'rev0',
        modules: [],
        deleted: [],
        sourceMappingURLs: [],
        sourceURLs: [],
      });
      emit('update-done');

      const update = {
        revisionId: 'rev1',
        modules: [[1, '0.1']],
        deleted: [0],
        sourceMappingURLs: [],
        sourceURLs: [],
      };
      emit('update-start');
      emit('update', update);
      emit('update-done');

      expect(global.clients.get).toHaveBeenCalledWith('client0');

      await flushPromises();

      expect(clientMock.postMessage).toHaveBeenCalledWith({
        type: 'METRO_UPDATE',
        update,
      });
    });

    it('sends an update start message to clients', async () => {
      const clientMock = {
        postMessage: jest.fn(),
      };
      global.clients = {
        get: jest.fn().mockResolvedValue(clientMock),
      };
      const deltaClient = createDeltaClient();

      deltaClient({
        clientId: 'client0',
        request: new Request('https://localhost/bundles/cool.bundle'),
      });

      await flushPromises();

      emit('open');
      emit('update-start');
      emit('update', {
        revisionId: 'rev0',
        modules: [],
        deleted: [],
        sourceMappingURLs: [],
        sourceURLs: [],
      });
      emit('update-done');

      emit('update-start');

      expect(global.clients.get).toHaveBeenCalledWith('client0');

      await flushPromises();

      expect(clientMock.postMessage).toHaveBeenCalledWith({
        type: 'METRO_UPDATE_START',
      });
    });

    it('sends an update error message to clients', async () => {
      const clientMock = {
        postMessage: jest.fn(),
      };
      global.clients = {
        get: jest.fn().mockResolvedValue(clientMock),
      };
      const deltaClient = createDeltaClient();

      deltaClient({
        clientId: 'client0',
        request: new Request('https://localhost/bundles/cool.bundle'),
      });

      await flushPromises();

      emit('open');
      emit('update-start');
      emit('update', {
        revisionId: 'rev0',
        modules: [],
        deleted: [],
        sourceMappingURLs: [],
        sourceURLs: [],
      });
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

      expect(clientMock.postMessage).toHaveBeenCalledWith({
        type: 'METRO_UPDATE_ERROR',
        error,
      });
    });

    it('patches the cached bundle on later update', async () => {
      const deltaClient = createDeltaClient();

      const bundleReq = new Request('https://localhost/bundles/cool.bundle');

      deltaClient({
        clientId: 'client0',
        request: bundleReq,
      });

      await flushPromises();

      emit('open');
      emit('update-start');
      emit('update', {
        revisionId: 'rev0',
        modules: [],
        deleted: [],
        sourceMappingURLs: [],
        sourceURLs: [],
      });
      emit('update-done');

      const update = {
        revisionId: 'rev1',
        modules: [[1, '0.1']],
        deleted: [0],
        sourceMappingURLs: [],
        sourceURLs: [],
      };
      emit('update-start');
      emit('update', update);
      emit('update-done');

      await flushPromises();

      expect(setBundleResponse).toHaveBeenCalledTimes(1);
      expect(setBundleResponse.mock.calls[0][0]).toEqual(bundleReq);
      expect(await setBundleResponse.mock.calls[0][1].text())
        .toMatchInlineSnapshot(`
"pre(\\"rev0\\");
0.1
post(\\"rev0\\");
//# offsetTable={\\"revisionId\\":\\"rev1\\",\\"pre\\":12,\\"post\\":13,\\"modules\\":[[1,3]]}"
`);
    });

    it('accepts a custom onUpdate function', async () => {
      const onUpdate = jest.fn();
      const deltaClient = createDeltaClient({onUpdate});

      deltaClient({
        clientId: 'client0',
        request: new Request('https://localhost/bundles/cool.bundle'),
      });

      await flushPromises();

      emit('open');
      emit('update-start');
      emit('update', {
        revisionId: 'rev0',
        modules: [],
        deleted: [],
        sourceMappingURLs: [],
        sourceURLs: [],
      });
      emit('update-done');

      const update = {
        revisionId: 'rev1',
        modules: [[1, '0.1']],
        deleted: [0],
        sourceMappingURLs: [],
        sourceURLs: [],
      };
      emit('update-start');
      emit('update', update);
      emit('update-done');

      expect(onUpdate).toHaveBeenCalledWith('client0', update);
    });

    it('accepts a custom onUpdateStart function', async () => {
      const onUpdateStart = jest.fn();
      const deltaClient = createDeltaClient({onUpdateStart});

      deltaClient({
        clientId: 'client0',
        request: new Request('https://localhost/bundles/cool.bundle'),
      });

      await flushPromises();

      emit('open');
      emit('update-start');
      emit('update', {
        revisionId: 'rev0',
        modules: [],
        deleted: [],
        sourceMappingURLs: [],
        sourceURLs: [],
      });
      emit('update-done');

      emit('update-start');

      expect(onUpdateStart).toHaveBeenCalledWith('client0');
    });

    it('accepts a custom onUpdateError function', async () => {
      const onUpdateError = jest.fn();
      const deltaClient = createDeltaClient({onUpdateError});

      deltaClient({
        clientId: 'client0',
        request: new Request('https://localhost/bundles/cool.bundle'),
      });

      await flushPromises();

      emit('open');
      emit('update-start');
      emit('update', {
        revisionId: 'rev0',
        modules: [],
        deleted: [],
        sourceMappingURLs: [],
        sourceURLs: [],
      });
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

    it('only connects once for a given revisionId', async () => {
      const onUpdate = jest.fn();
      const deltaClient = createDeltaClient({onUpdate});

      deltaClient({
        clientId: 'client0',
        request: new Request('https://localhost/bundles/cool.bundle'),
      });

      deltaClient({
        clientId: 'client1',
        request: new Request('https://localhost/bundles/cool.bundle'),
      });

      await flushPromises();

      emit('open');
      emit('update-start');
      emit('update', {
        revisionId: 'rev0',
        modules: [],
        deleted: [],
        sourceMappingURLs: [],
        sourceURLs: [],
      });
      emit('update-done');

      const update = {
        revisionId: 'rev1',
        modules: [[0, '0.1']],
        deleted: [],
        sourceMappingURLs: [],
        sourceURLs: [],
      };

      emit('update-start');
      emit('update', update);
      emit('update-done');

      expect(WebSocketHMRClient).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenNthCalledWith(1, 'client0', update);
      expect(onUpdate).toHaveBeenNthCalledWith(2, 'client1', update);
    });

    it('reconnects when a new request comes in', async () => {
      const deltaClient = createDeltaClient();

      deltaClient({
        clientId: 'client0',
        request: new Request('https://localhost/bundles/cool.bundle'),
      });

      await flushPromises();

      expect(WebSocketHMRClient).toHaveBeenCalledTimes(1);

      emit('close');

      deltaClient({
        clientId: 'client1',
        request: new Request('https://localhost/bundles/cool.bundle'),
      });

      await flushPromises();

      emit('close');

      expect(WebSocketHMRClient).toHaveBeenCalledTimes(2);
    });

    it('connection errors bubble up', async () => {
      const deltaClient = createDeltaClient();

      const promise = deltaClient({
        clientId: 'client0',
        request: new Request('https://localhost/bundles/cool.bundle'),
      });

      await flushPromises();

      emit('connection-error', new Error('Oh no! An error was thrown!'));

      expect(promise).rejects.toThrowErrorMatchingInlineSnapshot(`
"Error retrieving update from the update server for https://localhost/bundles/cool.bundle. Try refreshing the page.
Error message: Oh no! An error was thrown!"
`);
    });
  });
});
