/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @emails oncall+js_foundation
 * @format
 */
'use strict';

const MetroClient = require('../MetroClient');

let mockSocket = null;
global.WebSocket = jest.fn(() => {
  mockSocket = {
    onerror: jest.fn(),
    onmessage: jest.fn(),
    close: jest.fn(),
    mockEmit: (type, data) => {
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
  const client = new MetroClient('wss://banana.com/phone');

  const mockError = {
    message: 'An error occurred.',
  };
  const mockErrorCallback = jest.fn(data => expect(data).toEqual(mockError));
  const mockUpdateStartCallback = jest.fn();

  expect(mockSocket).toBeNull();
  client.on('connection-error', mockErrorCallback);
  client.on('update-start', mockUpdateStartCallback);
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
});
