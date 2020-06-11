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

const HmrServer = require('../HmrServer');

const getGraphId = require('../lib/getGraphId');

const {getDefaultValues} = require('metro-config/src/defaults');

jest.mock('../lib/transformHelpers', () => ({
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

    const options = getDefaultValues('/root');
    options.serializer.experimentalSerializerHook = () => {};
    options.reporter.update = jest.fn();
    options.transformer.experimentalImportBundleSupport = false;
    options.resolver.platforms = [];
    options.server.rewriteRequestUrl = function(requrl) {
      const rewritten = requrl.replace(/__REMOVE_THIS_WHEN_REWRITING__/g, '');
      if (rewritten !== requrl) {
        return rewritten + '&TEST_URL_WAS_REWRITTEN=true';
      }
      return requrl;
    };

    hmrServer = new HmrServer(
      incrementalBundlerMock,
      createModuleIdMock,
      options,
    );

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
          customTransformOptions: {},
          dev: true,
          hot: true,
          minify: false,
          platform: 'ios',
          runtimeBytecodeVersion: null,
          type: 'module',
        },
        {
          shallow: false,
          experimentalImportBundleSupport: false,
        },
      ),
    );
  });

  it('should retrieve the correct graph when there are extra params', async () => {
    await connect(
      '/hot?bundleEntry=EntryPoint.js&platform=ios&unusedExtraParam=42',
    );

    expect(getRevisionByGraphIdMock).toBeCalledWith(
      getGraphId(
        '/root/EntryPoint.js',
        {
          customTransformOptions: {},
          dev: true,
          hot: true,
          minify: false,
          platform: 'ios',
          runtimeBytecodeVersion: null,
          type: 'module',
        },
        {
          shallow: false,
          experimentalImportBundleSupport: false,
        },
      ),
    );
  });

  it('should rewrite URLs before retrieving the graph', async () => {
    await connect(
      '/hot?bundleEntry=Entry__REMOVE_THIS_WHEN_REWRITING__Point.js&platform=ios',
    );

    expect(getRevisionByGraphIdMock).toBeCalledWith(
      getGraphId(
        '/root/EntryPoint.js',
        {
          customTransformOptions: {},
          dev: true,
          hot: true,
          minify: false,
          platform: 'ios',
          runtimeBytecodeVersion: null,
          type: 'module',
        },
        {
          shallow: false,
          experimentalImportBundleSupport: false,
        },
      ),
    );
  });

  it('should send an error message when the graph cannot be found', async () => {
    const sendMessage = jest.fn();
    getRevisionByGraphIdMock.mockReturnValueOnce(undefined);

    await connect('/hot?bundleEntry=EntryPoint.js&platform=ios', sendMessage);

    const expectedMessage = `The graph \`${getGraphId(
      '/root/EntryPoint.js',
      {
        customTransformOptions: {},
        dev: true,
        hot: true,
        minify: false,
        platform: 'ios',
        runtimeBytecodeVersion: null,
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

    await connect('/hot?bundleEntry=EntryPoint.js&platform=ios', sendMessage);

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
            {
              module: [
                '/root/hi-id',
                '__d(function() { alert("hi"); },"/root/hi-id",[],"hi",{});\n' +
                  '//# sourceMappingURL=http://localhost/hi.map?platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true\n' +
                  '//# sourceURL=http://localhost/hi.bundle?platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true\n',
              ],
              sourceMappingURL:
                'http://localhost/hi.map?platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true',
              sourceURL:
                'http://localhost/hi.bundle?platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true',
            },
          ],
          deleted: ['/root/bye-id'],
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

    const client = await connect('/hot?platform=ios', sendMessage1);
    const client2 = await connect('/hot?platform=ios', sendMessage2);

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
            {
              module: [
                '/root/hi-id',
                '__d(function() { alert("hi"); },"/root/hi-id",[],"hi",{});\n' +
                  '//# sourceMappingURL=http://localhost/hi.map?platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true\n' +
                  '//# sourceURL=http://localhost/hi.bundle?platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true\n',
              ],

              sourceURL:
                'http://localhost/hi.bundle?platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true',
              sourceMappingURL:
                'http://localhost/hi.map?platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true',
            },
          ],
          deleted: ['/root/bye-id'],
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

    await connect('/hot?bundleEntry=EntryPoint.js&platform=ios', sendMessage);

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
            {
              module: [
                '/root/hi-id',
                '__d(function() { alert("hi"); },"/root/hi-id",[],"hi",{});\n' +
                  '//# sourceMappingURL=http://localhost/hi.map?platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true\n' +
                  '//# sourceURL=http://localhost/hi.bundle?platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true\n',
              ],
              sourceURL:
                'http://localhost/hi.bundle?platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true',
            },
          ],
          deleted: ['/root/bye-id'],
        },
      },
      {
        type: 'update-done',
      },
    ]);
  });

  it('should propagate extra params to module URLs', async () => {
    const sendMessage = jest.fn();

    await connect(
      '/hot?bundleEntry=EntryPoint.js&platform=ios&unusedExtraParam=42',
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
            {
              module: expect.any(Array),
              sourceURL:
                'http://localhost/hi.bundle?platform=ios&unusedExtraParam=42&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true',
            },
          ],
          deleted: ['/root/bye-id'],
        },
      },
      {
        type: 'update-done',
      },
    ]);
  });

  it('should propagate rewritten URL params to module URLs', async () => {
    const sendMessage = jest.fn();

    await connect(
      '/hot?bundleEntry=Entry__REMOVE_THIS_WHEN_REWRITING__Point.js&platform=ios',
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
            {
              module: expect.any(Array),
              sourceURL:
                'http://localhost/hi.bundle?platform=ios&TEST_URL_WAS_REWRITTEN=true&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true',
            },
          ],
          deleted: ['/root/bye-id'],
        },
      },
      {
        type: 'update-done',
      },
    ]);
  });

  it('should return error messages when there is a transform error', async () => {
    jest.useRealTimers();
    const sendMessage = jest.fn();

    await connect('/hot?bundleEntry=EntryPoint.js&platform=ios', sendMessage);

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
