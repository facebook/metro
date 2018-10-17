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

describe('HmrServer', () => {
  let hmrServer;
  let incrementalBundlerMock;
  let getRevisionMock;
  let getRevisionByGraphIdMock;
  let createModuleIdMock;
  let deltaBundlerMock;
  let callbacks;
  let mockedGraph;

  beforeEach(() => {
    mockedGraph = {
      dependencies: new Map(),
      entryPoint: '/root/EntryPoint.js',
    };

    callbacks = new Map();

    deltaBundlerMock = {
      listen: (graph, cb) => {
        callbacks.set(graph, cb);
      },
    };
    getRevisionMock = jest
      .fn()
      .mockReturnValue(Promise.resolve({graph: mockedGraph, id: 'XXX'}));
    getRevisionByGraphIdMock = jest
      .fn()
      .mockReturnValue(Promise.resolve({graph: mockedGraph, id: 'XXX'}));
    incrementalBundlerMock = {
      getDeltaBundler() {
        return deltaBundlerMock;
      },
      getRevision: getRevisionMock,
      getRevisionByGraphId: getRevisionByGraphIdMock,
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
      resolver: {
        platforms: [],
      },
    });
  });

  it('should retrieve the correct graph from the incremental bundler (graphId)', async () => {
    await hmrServer.onClientConnect(
      '/hot?bundleEntry=EntryPoint.js&platform=ios',
      jest.fn(),
    );

    expect(getRevisionByGraphIdMock).toBeCalledWith(
      getGraphId('/root/EntryPoint.js', {
        hot: true,
        dev: true,
        minify: false,
        platform: 'ios',
        customTransformOptions: {},
        type: 'module',
      }),
    );

    await hmrServer.onClientConnect(
      '/hot?bundleEntry=EntryPoint.js&platform=ios&deltaBundleId=test-id',
      jest.fn(),
    );

    expect(getRevisionMock).toBeCalledWith('test-id');
  });

  it('should send an error message when the graph cannot be found', async () => {
    const sendMessage = jest.fn();
    getRevisionByGraphIdMock.mockReturnValueOnce(undefined);

    const client = await hmrServer.onClientConnect(
      '/hot?bundleEntry=EntryPoint.js&platform=ios',
      sendMessage,
    );

    const expectedMessage = `The graph \`${getGraphId('/root/EntryPoint.js', {
      hot: true,
      dev: true,
      minify: false,
      platform: 'ios',
      customTransformOptions: {},
      type: 'module',
    })}\` was not found.`;

    const sentErrorMessage = JSON.parse(sendMessage.mock.calls[0][0]);
    expect(sentErrorMessage).toMatchObject({type: 'error'});
    expect(sentErrorMessage.body).toMatchObject({
      type: 'GraphNotFoundError',
      message: expectedMessage,
      errors: [],
    });
    expect(client).toBe(null);
  });

  it('should send an error message when the revision cannot be found', async () => {
    const sendMessage = jest.fn();
    getRevisionMock.mockReturnValueOnce(undefined);

    const client = await hmrServer.onClientConnect(
      '/hot?bundleEntry=EntryPoint.js&revisionId=test-id',
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
    expect(client).toBe(null);
  });

  it('should return the correctly formatted HMR message after a file change', async () => {
    const sendMessage = jest.fn();

    await hmrServer.onClientConnect(
      '/hot?bundleEntry=EntryPoint.js&platform=ios',
      sendMessage,
    );

    incrementalBundlerMock.updateGraph = jest.fn().mockReturnValue(
      Promise.resolve({
        revision: {
          id: 'revision-id',
          graph: mockedGraph,
        },
        delta: {
          modified: new Map([
            [
              '/root/hi',
              {
                dependencies: new Map(),
                inverseDependencies: new Set(),
                path: '/root/hi',
                output: [
                  {
                    type: 'js/module',
                    data: {
                      code: '__d(function() { alert("hi"); });',
                    },
                  },
                ],
              },
            ],
          ]),
        },
      }),
    );

    const promise = callbacks.get(mockedGraph)();
    jest.runAllTimers();
    await promise;

    expect(sendMessage.mock.calls.map(call => JSON.parse(call[0]))).toEqual([
      {
        type: 'update-start',
      },
      {
        type: 'update',
        body: {
          id: 'revision-id',
          delta: [
            [
              '/root/hi-id',
              '__d(function() { alert("hi"); },"/root/hi-id",[],"hi",{});',
            ],
          ],
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

    await hmrServer.onClientConnect(
      '/hot?bundleEntry=EntryPoint.js&platform=ios',
      sendMessage,
    );

    incrementalBundlerMock.updateGraph = jest.fn().mockImplementation(() => {
      const transformError = new SyntaxError('test syntax error');
      transformError.type = 'TransformError';
      transformError.filename = 'EntryPoint.js';
      transformError.lineNumber = 123;
      throw transformError;
    });

    await callbacks.get(mockedGraph)();

    expect(JSON.parse(sendMessage.mock.calls[0][0])).toEqual({
      type: 'update-start',
    });
    const sentErrorMessage = JSON.parse(sendMessage.mock.calls[1][0]);
    expect(sentErrorMessage).toMatchObject({type: 'error'});
    expect(sentErrorMessage.body).toMatchObject({
      type: 'TransformError',
      message: 'test syntax error',
      errors: [
        {
          description: 'test syntax error',
          filename: 'EntryPoint.js',
          lineNumber: 123,
        },
      ],
    });
    expect(JSON.parse(sendMessage.mock.calls[2][0])).toEqual({
      type: 'update-done',
    });
  });
});
