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

const createDeltaClient = require('../createDeltaClient');

const {getBundle, setBundle} = require('../bundleCache');
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

describe('createDeltaClient', () => {
  let fetch;
  beforeEach(() => {
    global.__DEV__ = true;
    fetch = global.fetch = jest.fn();
    global.URL = URL;
    global.Response = Response;
    global.Request = Request;
    global.Headers = Headers;
  });

  it('retrieves a bundle from cache and patches it with a delta bundle', async () => {
    const bundle = createBundle('0', [0]);
    const delta = createDelta('1', [1], [0]);
    getBundle.mockResolvedValue(bundle);
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
post(\\"0\\");"
`);
  });

  it('supports a custom getDeltaBundle function', async () => {
    const bundle = createBundle('rev0', [0]);
    const delta = createDelta('rev2', [2], [0]);
    getBundle.mockResolvedValue(bundle);
    const getDeltaBundle = jest.fn().mockResolvedValue(delta);
    const deltaClient = createDeltaClient({getDeltaBundle});

    const bundleReq = new Request('http://localhost/bundles/cool.bundle');
    const res = await deltaClient({
      clientId: 'clientId',
      request: bundleReq,
    });

    expect(getDeltaBundle).toHaveBeenCalledWith(bundleReq, 'rev0');
    expect(await res.text()).toMatchInlineSnapshot(`
"pre(\\"rev0\\");
__d(2);
post(\\"rev0\\");"
`);
  });

  it('retrieves a bundle from cache and patches it with a new bundle', async () => {
    const bundle = createBundle('rev0', [0]);
    const newBundle = createBundle('rev1', [1]);
    getBundle.mockResolvedValue(bundle);
    fetch.mockResolvedValue(new Response(JSON.stringify(newBundle)));
    const deltaClient = createDeltaClient();

    const bundleReq = new Request('http://localhost/bundles/cool.bundle');
    const res = await deltaClient({
      clientId: 'clientId',
      request: bundleReq,
    });

    expect(getBundle).toHaveBeenCalledWith(bundleReq);
    expect(await res.text()).toMatchInlineSnapshot(`
"pre(\\"rev1\\");
__d(1);
post(\\"rev1\\");"
`);
  });

  it('fetches the original bundle if an error is thrown while fetching a delta bundle', async () => {
    const bundle = createBundle('rev0', [0]);
    getBundle.mockResolvedValue(bundle);
    fetch.mockRejectedValueOnce(new Error('Fetch error')).mockResolvedValueOnce(
      new Response(`pre1
1
post1
//# offsetTable={"pre": 4,"post":5,"modules":[[1,1]],"revisionId":"rev1"}`),
    );
    const deltaClient = createDeltaClient();

    const bundleReq = new Request('http://localhost/bundles/cool.bundle');
    const res = await deltaClient({
      clientId: 'clientId',
      request: bundleReq,
    });

    expect(fetch).toHaveBeenCalledWith(bundleReq, {includeCredentials: true});
    expect(await res.text()).toMatchInlineSnapshot(`
"pre1
1
post1"
`);
  });

  it('fetches the original bundle if a previous bundle cannot be found in cache', async () => {
    getBundle.mockResolvedValue(null);
    fetch.mockResolvedValueOnce(
      new Response(`pre
0
post
//# offsetTable={"pre": 3,"post":4,"modules":[[0,1]],"revisionId":"rev0"}`),
    );
    const deltaClient = createDeltaClient();

    const bundleReq = new Request('http://localhost/bundles/cool.bundle');
    const res = await deltaClient({
      clientId: 'clientId',
      request: bundleReq,
    });

    expect(fetch).toHaveBeenCalledWith(bundleReq, {includeCredentials: true});
    expect(await res.text()).toMatchInlineSnapshot(`
"pre
0
post"
`);
  });

  it('sets the patched bundle in cache', async () => {
    const bundle = createBundle('rev0', [0]);
    const delta = createDelta('rev1', [1], [0]);
    getBundle.mockResolvedValue(bundle);
    fetch.mockResolvedValue(new Response(JSON.stringify(delta)));
    const deltaClient = createDeltaClient();

    const bundleReq = new Request('http://localhost/bundles/cool.bundle');
    await deltaClient({
      clientId: 'clientId',
      request: bundleReq,
    });

    expect(setBundle).toHaveBeenCalledWith(bundleReq, {
      base: true,
      revisionId: 'rev1',
      pre: 'pre("rev0");',
      post: 'post("rev0");',
      modules: [[1, '__d(1);']],
    });
  });

  describe('HMR', () => {
    beforeEach(() => {
      const bundle = createBundle('rev0', [0]);
      const delta = createDelta('rev1', [1], [0]);
      getBundle.mockResolvedValue(bundle);
      fetch.mockResolvedValue(new Response(JSON.stringify(delta)));
      WebSocketHMRClient.mockClear();
    });

    it('sets up the HMR client', async () => {
      const deltaClient = createDeltaClient({hot: true});

      await deltaClient({
        clientId: 'client0',
        request: new Request('http://localhost/bundles/cool.bundle'),
      });

      expect(WebSocketHMRClient).toHaveBeenCalledWith(
        'ws://localhost/hot?revisionId=rev1',
      );
    });

    it('sets up the HMR client (HTTPS)', async () => {
      const deltaClient = createDeltaClient({hot: true});

      await deltaClient({
        clientId: 'client0',
        request: new Request('https://localhost/bundles/cool.bundle'),
      });

      expect(WebSocketHMRClient).toHaveBeenCalledWith(
        'wss://localhost/hot?revisionId=rev1',
      );
    });

    it('accepts a custom getHmrServerUrl function', async () => {
      const getHmrServerUrl = jest.fn().mockReturnValue('ws://whatever');
      const deltaClient = createDeltaClient({hot: true, getHmrServerUrl});

      const bundleReq = new Request('https://localhost/bundles/cool.bundle');
      await deltaClient({
        clientId: 'client0',
        request: bundleReq,
      });

      expect(getHmrServerUrl).toHaveBeenCalledWith(bundleReq, 'rev1');
      expect(WebSocketHMRClient).toHaveBeenCalledWith('ws://whatever');
    });

    it('sends an HMR update to clients', async () => {
      const clientMock = {
        postMessage: jest.fn(),
      };
      global.clients = {
        get: jest.fn().mockResolvedValue(clientMock),
      };
      const deltaClient = createDeltaClient({hot: true});

      await deltaClient({
        clientId: 'client0',
        request: new Request('https://localhost/bundles/cool.bundle'),
      });
      const hmrUpdate = {
        revisionId: 'rev2',
        modules: [[0, '0.1']],
        deleted: [],
        sourceMappingURLs: [],
        sourceURLs: [],
      };
      const updateHandlers = WebSocketHMRClient.mock.instances[0].on.mock.calls.filter(
        call => call[0] === 'update',
      );
      updateHandlers.forEach(updateHandler => updateHandler[1](hmrUpdate));
      expect(global.clients.get).toHaveBeenCalledWith('client0');

      // The default update function is asynchronous.
      await new Promise(resolve => setImmediate(resolve));
      expect(clientMock.postMessage).toHaveBeenCalledWith({
        type: 'HMR_UPDATE',
        body: hmrUpdate,
      });
    });

    it('patches the cached bundle on update', async () => {
      const deltaClient = createDeltaClient({hot: true});

      const bundleReq = new Request('https://localhost/bundles/cool.bundle');
      await deltaClient({
        clientId: 'client0',
        request: bundleReq,
      });
      const hmrUpdate = {
        revisionId: 'rev2',
        modules: [[1, '0.1']],
        deleted: [0],
        sourceMappingURLs: [],
        sourceURLs: [],
      };
      const updateHandlers = WebSocketHMRClient.mock.instances[0].on.mock.calls.filter(
        call => call[0] === 'update',
      );
      updateHandlers.forEach(updateHandler => updateHandler[1](hmrUpdate));
      expect(setBundle).toHaveBeenCalledWith(bundleReq, {
        base: true,
        revisionId: 'rev2',
        pre: 'pre("rev0");',
        post: 'post("rev0");',
        modules: [[1, '0.1']],
      });
    });

    it('accepts a custom onUpdate function', async () => {
      const onUpdate = jest.fn();
      const deltaClient = createDeltaClient({hot: true, onUpdate});

      await deltaClient({
        clientId: 'client0',
        request: new Request('https://localhost/bundles/cool.bundle'),
      });
      const hmrUpdate = {
        revisionId: 'rev2',
        modules: [[0, '0.1']],
        deleted: [],
        sourceMappingURLs: [],
        sourceURLs: [],
      };
      const updateHandlers = WebSocketHMRClient.mock.instances[0].on.mock.calls.filter(
        call => call[0] === 'update',
      );
      updateHandlers.forEach(updateHandler => updateHandler[1](hmrUpdate));

      expect(onUpdate).toHaveBeenCalledWith('client0', hmrUpdate);
    });

    it('only connects once for a given revisionId', async () => {
      const bundle = createBundle('rev0', [0]);
      const delta = createDelta('rev0', [], []);
      getBundle.mockResolvedValue(bundle);
      fetch.mockResolvedValue(new Response(JSON.stringify(delta)));
      const onUpdate = jest.fn();
      const deltaClient = createDeltaClient({hot: true, onUpdate});

      await deltaClient({
        clientId: 'client0',
        request: new Request('https://localhost/bundles/cool.bundle'),
      });
      fetch.mockResolvedValue(new Response(JSON.stringify(delta)));
      await deltaClient({
        clientId: 'client1',
        request: new Request('https://localhost/bundles/cool.bundle'),
      });

      const hmrUpdate = {
        revisionId: 'rev2',
        modules: [[0, '0.1']],
        deleted: [],
        sourceMappingURLs: [],
        sourceURLs: [],
      };

      expect(WebSocketHMRClient).toHaveBeenCalledTimes(1);
      const updateHandlers = WebSocketHMRClient.mock.instances[0].on.mock.calls.filter(
        call => call[0] === 'update',
      );
      updateHandlers.forEach(updateHandler => updateHandler[1](hmrUpdate));

      expect(onUpdate).toHaveBeenCalledWith('client0', hmrUpdate);
      expect(onUpdate).toHaveBeenCalledWith('client1', hmrUpdate);
    });

    it('reconnects when a new request comes in', async () => {
      const bundle = createBundle('rev0', [0]);
      const delta = createDelta('rev0', [], []);
      getBundle.mockResolvedValue(bundle);
      fetch.mockResolvedValue(new Response(JSON.stringify(delta)));
      const onUpdate = jest.fn();
      const deltaClient = createDeltaClient({hot: true, onUpdate});

      await deltaClient({
        clientId: 'client0',
        request: new Request('https://localhost/bundles/cool.bundle'),
      });

      expect(WebSocketHMRClient).toHaveBeenCalledTimes(1);
      const closeHandlers = WebSocketHMRClient.mock.instances[0].on.mock.calls.filter(
        call => call[0] === 'close',
      );
      closeHandlers.forEach(handler => handler[1]());

      fetch.mockResolvedValue(new Response(JSON.stringify(delta)));
      await deltaClient({
        clientId: 'client1',
        request: new Request('https://localhost/bundles/cool.bundle'),
      });

      expect(WebSocketHMRClient).toHaveBeenCalledTimes(2);
    });
  });
});
