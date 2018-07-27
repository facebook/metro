/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+js_foundation
 */
'use strict';

jest.mock('../../lib/getAbsolutePath');

const HmrServer = require('..');

describe('HmrServer', () => {
  let hmrServer;
  let serverMock;
  let buildGraphMock;
  let deltaBundlerMock;
  let callbacks;
  let mockedGraph;

  beforeEach(() => {
    mockedGraph = {
      dependencies: new Map(),
      entryPoint: 'EntryPoint.js',
    };

    buildGraphMock = jest.fn().mockReturnValue(mockedGraph);

    callbacks = new Map();

    deltaBundlerMock = {
      listen: (graph, cb) => {
        callbacks.set(graph, cb);
      },
    };
    serverMock = {
      buildGraph: buildGraphMock,
      getDeltaBundler() {
        return deltaBundlerMock;
      },
      _createModuleId(path) {
        return path + '-id';
      },
    };

    hmrServer = new HmrServer(serverMock, {
      reporter: {
        update: jest.fn(),
      },
      watchFolders: ['/root'],
    });
  });

  it('should pass the correct options to the delta bundler', async () => {
    await hmrServer.onClientConnect(
      '/hot?bundleEntry=EntryPoint.js&platform=ios',
      jest.fn(),
    );

    expect(buildGraphMock).toBeCalledWith(
      ['/root/EntryPoint.js'],
      expect.objectContaining({
        dev: true,
        minify: false,
        platform: 'ios',
      }),
    );
  });

  it('should return the correctly formatted HMR message after a file change', async () => {
    const sendMessage = jest.fn();

    await hmrServer.onClientConnect(
      '/hot?bundleEntry=EntryPoint.js&platform=ios',
      sendMessage,
    );

    deltaBundlerMock.getDelta = jest.fn().mockReturnValue(
      Promise.resolve({
        modified: new Map([
          [
            '/hi',
            {
              dependencies: new Map(),
              inverseDependencies: new Set(),
              path: '/hi',
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
      }),
    );

    await callbacks.get(mockedGraph)();

    expect(sendMessage.mock.calls.map(call => JSON.parse(call[0]))).toEqual([
      {
        type: 'update-start',
      },
      {
        type: 'update',
        body: {
          modules: [
            {
              id: '/hi-id',
              code: '__d(function() { alert("hi"); },"/hi-id",[],"hi",{});',
            },
          ],
          sourceURLs: {},
          sourceMappingURLs: {},
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

    deltaBundlerMock.getDelta = jest.fn().mockImplementation(async () => {
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
