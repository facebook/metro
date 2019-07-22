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
  expect(mockSocket).toBeNull();
  const client = new WebSocketHMRClient('wss://banana.com/phone');
  if (!mockSocket) {
    throw new Error('mockSocket was not set when opening the connection.');
  }

  const mockError = {
    message: 'An error occurred.',
  };
  const mockErrorCallback = jest.fn(data => expect(data).toEqual(mockError));
  const mockUpdateStartCallback = jest.fn();
  const mockCloseCallback = jest.fn();

  client.on('connection-error', mockErrorCallback);
  client.on('update-start', mockUpdateStartCallback);
  client.on('close', mockCloseCallback);

  mockSocket.mockEmit('message', {
    data: JSON.stringify({
      type: 'update-start',
    }),
  });

  expect(mockUpdateStartCallback).toBeCalled();

  mockSocket.mockEmit('error', mockError);
  expect(mockErrorCallback).toBeCalled();

  expect(mockSocket.close).not.toBeCalled();
  client.close();
  expect(mockSocket.close).toBeCalled();
  expect(mockCloseCallback).toBeCalled();

  // Closing twice shouldn't throw.
  client.close();
});
