/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+js_foundation
 */
'use strict';

const HmrServer = require('..');

const getGraphId = require('../../lib/getGraphId');

jest.mock('../../lib/transformHelpers', () => ({
  getResolveDependencyFn: () => (from, to) =>
    `${require('path').resolve(from, to)}.js`,
}));

describe('HmrServer', () => {
  let hmrServer;
  let incrementalBundlerMock;
  let getRevisionMock;
  let getRevisionByGraphIdMock;
  let createModuleIdMock;
  let deltaBundlerMock;
  let callbacks;
  let mockedGraph;
  let connect;
  let message;

  const hiModule = {
    dependencies: new Map(),
    inverseDependencies: new Set(),
    path: '/root/hi',
    getSource: () => "alert('hi');",
    output: [
      {
        type: 'js/module',
        data: {
          map: [],
          code: '__d(function() { alert("hi"); });',
          lineCount: 1,
        },
      },
    ],
  };

  beforeEach(() => {
    mockedGraph = {
      dependencies: new Map(),
      entryPoint: '/root/EntryPoint.js',
    };

    callbacks = new Map();

    deltaBundlerMock = {
      listen: (graph, cb) => {
        let graphCallbacks = callbacks.get(graph);
        if (graphCallbacks == null) {
          graphCallbacks = [cb];
          callbacks.set(graph, graphCallbacks);
        } else {
          graphCallbacks.push(cb);
        }
        return () => graphCallbacks.splice(graphCallbacks.indexOf(cb), 1);
      },
    };
    getRevisionMock = jest
      .fn()
      .mockReturnValue(Promise.resolve({graph: mockedGraph, id: 'rev0'}));
    getRevisionByGraphIdMock = jest
      .fn()
      .mockReturnValue(Promise.resolve({graph: mockedGraph, id: 'rev0'}));
    incrementalBundlerMock = {
      getDeltaBundler() {
        return deltaBundlerMock;
      },
      getRevision: getRevisionMock,
      getRevisionByGraphId: getRevisionByGraphIdMock,
      updateGraph: jest.fn().mockResolvedValue({
        revision: {
          id: 'rev0',
          graph: mockedGraph,
        },
        delta: {
          added: new Map(),
          modified: new Map(),
          deleted: new Set(),
        },
      }),
      getBundler() {},
    };
    createModuleIdMock = path => {
      return path + '-id';
    };

    hmrServer = new HmrServer(incrementalBundlerMock, createModuleIdMock, {
      serializer: {
        experimentalSerializerHook: () => {},
      },
      projectRoot: '/root',
      reporter: {
        update: jest.fn(),
      },
      transformer: {
        experimentalImportBundleSupport: false,
      },
      resolver: {
        platforms: [],
      },
    });

    connect = async (relativeUrl, sendFn) => {
      relativeUrl = 'ws://localhost/' + relativeUrl;
      const client = await hmrServer.onClientConnect(
        relativeUrl,
        sendFn || jest.fn(),
      );
      await message(
        client,
        {
          type: 'register-entrypoints',
          entryPoints: [relativeUrl],
        },
        sendFn,
      );
      return client;
    };

    message = async (client, message, sendFn) => {
      await hmrServer.onClientMessage(
        client,
        JSON.stringify(message),
        sendFn || jest.fn(),
      );
    };
  });

  it('should retrieve the correct graph from the incremental bundler (graphId)', async () => {
    await connect('/hot?bundleEntry=EntryPoint.js&platform=ios');

    expect(getRevisionByGraphIdMock).toBeCalledWith(
      getGraphId(
        '/root/EntryPoint.js',
        {
          hot: true,
          dev: true,
          minify: false,
          platform: 'ios',
          customTransformOptions: {},
          type: 'module',
        },
        {
          shallow: false,
          experimentalImportBundleSupport: false,
        },
      ),
    );
  });

  it('should retrieve the correct graph from the incremental bundler (revisionId)', async () => {
    await connect('/hot?revisionId=test-id');

    expect(getRevisionMock).toBeCalledWith('test-id');
  });

  it('should only listen to file changes once', async () => {
    const client = await connect(
      '/hot?revisionId=test-id',
      jest.fn(),
    );
    await message(client, {
      type: 'register-entrypoints',
      entryPoints: ['http://localhost/hot?revisionId=test-id'],
    });

    expect(callbacks.get(mockedGraph).length).toBe(1);
  });

  it('should send an error message when the graph cannot be found', async () => {
    const sendMessage = jest.fn();
    getRevisionByGraphIdMock.mockReturnValueOnce(undefined);

    await connect(
      '/hot?bundleEntry=EntryPoint.js&platform=ios',
      sendMessage,
    );

    const expectedMessage = `The graph \`${getGraphId(
      '/root/EntryPoint.js',
      {
        hot: true,
        dev: true,
        minify: false,
        platform: 'ios',
        customTransformOptions: {},
        type: 'module',
      },
      {
        shallow: false,
        experimentalImportBundleSupport: false,
      },
    )}\` was not found.`;

    const sentErrorMessage = JSON.parse(sendMessage.mock.calls[0][0]);
    expect(sentErrorMessage).toMatchObject({type: 'error'});
    expect(sentErrorMessage.body).toMatchObject({
      type: 'GraphNotFoundError',
      message: expectedMessage,
      errors: [],
    });
  });

  it('should send an error message when the revision cannot be found', async () => {
    const sendMessage = jest.fn();
    getRevisionMock.mockReturnValueOnce(undefined);

    await connect(
      '/hot?revisionId=test-id',
      sendMessage,
    );

    const expectedMessage = 'The revision `test-id` was not found.';

    const sentErrorMessage = JSON.parse(sendMessage.mock.calls[0][0]);
    expect(sentErrorMessage).toMatchObject({type: 'error'});
    expect(sentErrorMessage.body).toMatchObject({
      type: 'RevisionNotFoundError',
      message: expectedMessage,
      errors: [],
    });
  });

  it('should send an initial update when a client connects', async () => {
    const sendMessage = jest.fn();

    incrementalBundlerMock.updateGraph.mockResolvedValue({
      revision: {
        id: 'rev0',
        graph: mockedGraph,
      },
      delta: {
        added: new Map(),
        modified: new Map([[hiModule.path, hiModule]]),
        deleted: new Set(['/root/bye']),
      },
    });

    await connect(
      '/hot?bundleEntry=EntryPoint.js&platform=ios',
      sendMessage,
    );

    const messages = sendMessage.mock.calls.map(call => JSON.parse(call[0]));
    expect(messages).toMatchObject([
      {
        type: 'update-start',
      },
      {
        type: 'update',
        body: {
          revisionId: 'rev0',
          added: [],
          modified: [
            [
              '/root/hi-id',
              '__d(function() { alert("hi"); },"/root/hi-id",[],"hi",{});',
            ],
          ],
          deleted: ['/root/bye-id'],
          addedSourceMappingURLs: [],
          addedSourceURLs: [],
          modifiedSourceURLs: [
            'http://localhost/hi.bundle?platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true',
          ],
          modifiedSourceMappingURLs: [expect.anything()],
        },
      },
      {
        type: 'update-done',
      },
      {
        type: 'bundle-registered',
      },
    ]);
  });

  it('should send the same update to all connected clients', async () => {
    const sendMessage1 = jest.fn();
    const sendMessage2 = jest.fn();

    const client = await connect(
      '/hot',
      sendMessage1,
    );
    const client2 = await connect(
      '/hot',
      sendMessage2,
    );

    await message(
      client,
      {
        type: 'register-entrypoints',
        entryPoints: [
          'http://localhost/hot?bundleEntry=EntryPoint.js&platform=ios',
        ],
      },
      sendMessage1,
    );
    await message(
      client2,
      {
        type: 'register-entrypoints',
        entryPoints: [
          'http://localhost/hot?bundleEntry=EntryPoint.js&platform=ios',
        ],
      },
      sendMessage2,
    );

    sendMessage1.mockReset();
    sendMessage2.mockReset();

    incrementalBundlerMock.updateGraph.mockResolvedValue({
      revision: {
        id: 'rev0',
        graph: mockedGraph,
      },
      delta: {
        added: new Map(),
        modified: new Map([[hiModule.path, hiModule]]),
        deleted: new Set(['/root/bye']),
      },
    });

    const promise = Promise.all(callbacks.get(mockedGraph).map(cb => cb()));
    jest.runAllTimers();
    await promise;

    const messages1 = sendMessage1.mock.calls.map(call => JSON.parse(call[0]));
    const messages2 = sendMessage2.mock.calls.map(call => JSON.parse(call[0]));

    expect(messages1).toMatchObject([
      {
        type: 'update-start',
      },
      {
        type: 'update',
        body: {
          revisionId: 'rev0',
          added: [],
          modified: [
            [
              '/root/hi-id',
              '__d(function() { alert("hi"); },"/root/hi-id",[],"hi",{});',
            ],
          ],
          deleted: ['/root/bye-id'],
          addedSourceMappingURLs: [],
          addedSourceURLs: [],
          modifiedSourceURLs: [
            'http://localhost/hi.bundle?platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true',
          ],
          modifiedSourceMappingURLs: [expect.anything()],
        },
      },
      {
        type: 'update-done',
      },
    ]);
    expect(messages1).toEqual(messages2);
  });

  it('should return the correctly formatted HMR message after a file change', async () => {
    const sendMessage = jest.fn();

    await connect(
      '/hot?bundleEntry=EntryPoint.js&platform=ios',
      sendMessage,
    );

    sendMessage.mockReset();

    incrementalBundlerMock.updateGraph.mockResolvedValue({
      revision: {
        id: 'rev1',
        graph: mockedGraph,
      },
      delta: {
        added: new Map(),
        modified: new Map([[hiModule.path, hiModule]]),
        deleted: new Set(['/root/bye']),
      },
    });

    const promise = Promise.all(callbacks.get(mockedGraph).map(cb => cb()));
    jest.runAllTimers();
    await promise;

    const messages = sendMessage.mock.calls.map(call => JSON.parse(call[0]));

    expect(messages).toMatchObject([
      {
        type: 'update-start',
      },
      {
        type: 'update',
        body: {
          revisionId: 'rev1',
          added: [],
          modified: [
            [
              '/root/hi-id',
              '__d(function() { alert("hi"); },"/root/hi-id",[],"hi",{});',
            ],
          ],
          deleted: ['/root/bye-id'],
          modifiedSourceURLs: [
            'http://localhost/hi.bundle?platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true',
          ],
        },
      },
      {
        type: 'update-done',
      },
    ]);

    const modifiedSourceMappingURL =
      messages[1].body.modifiedSourceMappingURLs[0];

    expect(
      JSON.parse(
        Buffer.from(
          modifiedSourceMappingURL.slice(
            modifiedSourceMappingURL.indexOf('base64') + 7,
          ),
          'base64',
        ).toString(),
      ),
    ).toEqual({
      mappings: '',
      names: [],
      sources: ['/root/hi'],
      sourcesContent: [hiModule.getSource()],
      version: 3,
    });
  });

  it('should return error messages when there is a transform error', async () => {
    jest.useRealTimers();
    const sendMessage = jest.fn();

    await connect(
      '/hot?bundleEntry=EntryPoint.js&platform=ios',
      sendMessage,
    );

    sendMessage.mockReset();

    incrementalBundlerMock.updateGraph.mockImplementation(() => {
      const transformError = new SyntaxError('test syntax error');
      transformError.type = 'TransformError';
      transformError.filename = 'EntryPoint.js';
      transformError.lineNumber = 123;
      throw transformError;
    });

    await Promise.all(callbacks.get(mockedGraph).map(cb => cb()));

    const messages = sendMessage.mock.calls.map(call => JSON.parse(call[0]));

    expect(messages).toMatchObject([
      {
        type: 'update-start',
      },
      {
        type: 'error',
        body: {
          type: 'TransformError',
          message: 'test syntax error',
          errors: [
            {
              description: 'test syntax error',
              filename: 'EntryPoint.js',
              lineNumber: 123,
            },
          ],
        },
      },
      {
        type: 'update-done',
      },
    ]);
  });
});
