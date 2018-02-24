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

const HmrServer = require('..');

const {EventEmitter} = require('events');

describe('HmrServer', () => {
  let hmrServer;
  let serverMock;
  let deltaBundlerMock;
  let deltaTransformerMock;
  let getDeltaTransformerMock;

  beforeEach(() => {
    deltaTransformerMock = new EventEmitter();
    deltaTransformerMock.getDelta = jest.fn().mockReturnValue({id: '1234'});
    deltaTransformerMock.getInverseDependencies = jest.fn();

    getDeltaTransformerMock = jest
      .fn()
      .mockReturnValue(Promise.resolve(deltaTransformerMock));

    deltaBundlerMock = {
      getDeltaTransformer: getDeltaTransformerMock,
    };
    serverMock = {
      getDeltaBundler() {
        return deltaBundlerMock;
      },
      getReporter() {
        return {
          update: jest.fn(),
        };
      },
    };

    hmrServer = new HmrServer(serverMock);
  });

  it('should pass the correct options to the delta bundler', async () => {
    await hmrServer.onClientConnect(
      '/hot?bundleEntry=EntryPoint.js&platform=ios',
      jest.fn(),
    );

    expect(getDeltaTransformerMock).toBeCalledWith(
      '/hot?bundleEntry=EntryPoint.js&platform=ios',
      expect.objectContaining({
        deltaBundleId: null,
        dev: true,
        entryFile: 'EntryPoint.js',
        minify: false,
        platform: 'ios',
      }),
    );
  });

  it('should generate an initial delta when a client is connected', async () => {
    await hmrServer.onClientConnect(
      '/hot?bundleEntry=EntryPoint.js&platform=ios',
      jest.fn(),
    );

    expect(deltaTransformerMock.getDelta).toBeCalled();
  });

  it('should return the correctly formatted HMR message after a file change', async done => {
    jest.useRealTimers();
    const sendMessage = jest.fn();

    await hmrServer.onClientConnect(
      '/hot?bundleEntry=EntryPoint.js&platform=ios',
      sendMessage,
    );

    deltaTransformerMock.getDelta.mockReturnValue(
      Promise.resolve({
        delta: new Map([[1, {code: '__d(function() { alert("hi"); });'}]]),
      }),
    );
    deltaTransformerMock.getInverseDependencies.mockReturnValue(
      Promise.resolve(
        new Map([
          [1, [2, 3]],
          [2, []],
          [3, [4]],
          [4, []],
          [5, [1, 2, 3]], // this shouldn't be added to the response
        ]),
      ),
    );

    deltaTransformerMock.emit('change');

    setTimeout(function() {
      expect(JSON.parse(sendMessage.mock.calls[0][0])).toEqual({
        type: 'update-start',
      });
      expect(JSON.parse(sendMessage.mock.calls[1][0])).toEqual({
        type: 'update',
        body: {
          modules: [
            {
              id: 1,
              code:
                '__d(function() { alert("hi"); },{"1":[2,3],"2":[],"3":[4],"4":[]});',
            },
          ],
          sourceURLs: {},
          sourceMappingURLs: {},
        },
      });
      expect(JSON.parse(sendMessage.mock.calls[2][0])).toEqual({
        type: 'update-done',
      });
      done();
    }, 30);
  });

  it('should return error messages when there is a transform error', async done => {
    jest.useRealTimers();
    const sendMessage = jest.fn();

    await hmrServer.onClientConnect(
      '/hot?bundleEntry=EntryPoint.js&platform=ios',
      sendMessage,
    );

    deltaTransformerMock.getDelta.mockImplementation(async () => {
      const transformError = new SyntaxError('test syntax error');
      transformError.type = 'TransformError';
      transformError.filename = 'EntryPoint.js';
      transformError.lineNumber = 123;
      throw transformError;
    });

    deltaTransformerMock.emit('change');

    setTimeout(function() {
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
      done();
    }, 30);
  });
});
