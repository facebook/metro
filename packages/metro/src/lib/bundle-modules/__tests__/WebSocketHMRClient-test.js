/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @emails oncall+js_foundation
 * @format
 */
'use strict';

const WebSocketHMRClient = require('../WebSocketHMRClient');

let mockSocket = null;
global.WebSocket = jest.fn(() => {
  mockSocket = {
    onerror: jest.fn(),
    onmessage: jest.fn(),
    onclose: jest.fn(),
    close: jest.fn(() => {
      if (mockSocket) {
        mockSocket.onclose();
      }
    }),
    mockEmit: (type: string, data) => {
      if (mockSocket) {
        if (type === 'error') {
          mockSocket.onerror(data);
        } else {
          mockSocket.onmessage(data);
        }
      }
    },
  };
  return mockSocket;
});

beforeEach(() => (mockSocket = null));

test('connects to a WebSocket and listens to messages', () => {
  const client = new WebSocketHMRClient('wss://banana.com/phone');

  expect(() => client.disable()).toThrowError(
    'Cannot call disable() before calling enable()',
  );

  const mockError = {
    message: 'An error occurred.',
  };
  const mockErrorCallback = jest.fn(data => expect(data).toEqual(mockError));
  const mockUpdateStartCallback = jest.fn();
  const mockCloseCallback = jest.fn();

  expect(mockSocket).toBeNull();
  client.on('connection-error', mockErrorCallback);
  client.on('update-start', mockUpdateStartCallback);
  client.on('close', mockCloseCallback);
  client.enable();
  if (!mockSocket) {
    throw new Error('mockSocket was not set when opening the connection.');
  }

  mockSocket.mockEmit('message', {
    data: JSON.stringify({
      type: 'update-start',
    }),
  });

  expect(mockUpdateStartCallback).toBeCalled();

  mockSocket.mockEmit('error', mockError);
  expect(mockErrorCallback).toBeCalled();

  expect(mockSocket.close).not.toBeCalled();
  client.disable();
  expect(mockSocket.close).toBeCalled();
  expect(mockCloseCallback).toBeCalled();

  // Disabling twice shouldn't throw.
  client.disable();

  expect(() => client.enable()).toThrowError('Cannot call enable() twice');
});
