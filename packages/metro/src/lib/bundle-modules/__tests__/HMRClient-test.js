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

const HMRClient = require('../HMRClient');

import type {HmrUpdate} from '../types.flow';

let mockSocket = null;
let evaledCode = '';

beforeEach(() => {
  evaledCode = '';
  global.nativeInjectHMRUpdate = (code, sourceURL) => {
    evaledCode += '\n/* ' + sourceURL + ' */\n  ' + code;
  };
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
});

afterEach(() => {
  delete global.WebSocket;
  delete global.nativeInjectHMRUpdate;
});

function sendUpdate(update: HmrUpdate) {
  if (!mockSocket) {
    throw new Error('mockSocket was not set when opening the connection.');
  }
  evaledCode += '\n/*** begin ' + update.revisionId + ' ***/';
  mockSocket.mockEmit('message', {
    data: JSON.stringify({
      type: 'update-start',
      body: {isInitialUpdate: false},
    }),
  });
  mockSocket.mockEmit('message', {
    data: JSON.stringify({
      type: 'update',
      body: update,
    }),
  });
  mockSocket.mockEmit('message', {
    data: JSON.stringify({
      type: 'update-end',
    }),
  });
  evaledCode += '\n/*** end ' + update.revisionId + ' ***/\n\n';
}

test('can apply updates individually and in a batch', () => {
  const updates: Array<HmrUpdate> = [
    {
      revisionId: 'A (add 1, 2, and 3)',
      added: [
        [1, 'function 1_A() {}'],
        [2, 'function 2_A() {}'],
        [3, 'function 3_A() {}'],
      ],
      addedSourceMappingURLs: ['1_A.js.map', '2_A.js.map', '3_A.js.map'],
      addedSourceURLs: ['1.js', '2.js', '3.js'],
      modified: [],
      modifiedSourceMappingURLs: [],
      modifiedSourceURLs: [],
      deleted: [],
    },
    {
      revisionId: 'B (add 4, edit 3 and 1)',
      added: [[4, 'function 4_B() {}']],
      addedSourceMappingURLs: ['4_B.js.map'],
      addedSourceURLs: ['4.js'],
      modified: [[3, 'function 3_B() {}'], [1, 'function 1_B() {}']],
      modifiedSourceMappingURLs: ['3_B.js.map', '1_B.js.map'],
      modifiedSourceURLs: ['3.js', '1.js'],
      deleted: [],
    },
    {
      revisionId: 'C (edit 2, delete 3)',
      added: [],
      addedSourceMappingURLs: [],
      addedSourceURLs: [],
      modified: [[2, 'function 2_C() {}']],
      modifiedSourceMappingURLs: ['2_C.js.map'],
      modifiedSourceURLs: ['2.js'],
      deleted: [3],
    },
    {
      revisionId: 'D (delete 1, add 3)',
      added: [[3, 'function 3_D() {}']],
      addedSourceMappingURLs: ['3_D.js.map'],
      addedSourceURLs: ['3.js'],
      modified: [],
      modifiedSourceMappingURLs: [],
      modifiedSourceURLs: [],
      deleted: [1],
    },
    {
      revisionId: 'E (edit 2 and 3)',
      added: [],
      addedSourceMappingURLs: [],
      addedSourceURLs: [],
      modified: [[2, 'function 2_E() {}'], [3, 'function 3_E() {}']],
      modifiedSourceMappingURLs: ['2_E.js.map', '3_E.js.map'],
      modifiedSourceURLs: ['2.js', '3.js'],
      deleted: [],
    },
  ];

  // We'll try two sequences. In the first one, updates are applied one by one.
  // This corresponds to the case where Fast Refresh is on.
  let client = new HMRClient('wss://banana.com/phone');
  client.enable();
  updates.forEach(update => sendUpdate(update));
  expect(evaledCode).toMatchSnapshot('1: run updates as they arrive');
  evaledCode = '';
  client.close();

  // Now, we'll create a new client that has Fast Refresh disabled.
  // (We won't call client.enable() right after creating it.)
  client = new HMRClient('wss://banana.com/phone');
  updates.forEach(update => sendUpdate(update));
  expect(evaledCode).toMatchSnapshot('2: ignore updates');
  evaledCode = '';
  // We expect that enabling it will result in a batch of updates.
  // We should see latest versions of each module that wasn't deleted.
  client.enable();
  expect(evaledCode).toMatchSnapshot('3: apply updates in a batch');
});

test('can add and delete a module in a batch', () => {
  const updates: Array<HmrUpdate> = [
    {
      revisionId: 'A (add 1 and 2)',
      added: [[1, 'function 1_A() {}'], [2, 'function 2_A() {}']],
      addedSourceMappingURLs: ['1_A.js.map', '2_A.js.map'],
      addedSourceURLs: ['1.js', '2.js'],
      modified: [],
      modifiedSourceMappingURLs: [],
      modifiedSourceURLs: [],
      deleted: [],
    },
    {
      revisionId: 'B (delete 2)',
      added: [],
      addedSourceMappingURLs: [],
      addedSourceURLs: [],
      modified: [],
      modifiedSourceMappingURLs: [],
      modifiedSourceURLs: [],
      deleted: [2],
    },
  ];

  const client = new HMRClient('wss://banana.com/phone');
  updates.forEach(update => sendUpdate(update));
  client.enable();
  expect(evaledCode).not.toContain('2_A');
  expect(evaledCode).toMatchSnapshot();
});

test('can delete and re-add a module in a batch', () => {
  const updates: Array<HmrUpdate> = [
    {
      revisionId: 'A (delete 2)',
      added: [],
      addedSourceMappingURLs: [],
      addedSourceURLs: [],
      modified: [],
      modifiedSourceMappingURLs: [],
      modifiedSourceURLs: [],
      deleted: [2],
    },
    {
      revisionId: 'B (add 1 and 2)',
      added: [[1, 'function 1_B() {}'], [2, 'function 2_B() {}']],
      addedSourceMappingURLs: ['1_B.js.map', '2_B.js.map'],
      addedSourceURLs: ['1.js', '2.js'],
      modified: [],
      modifiedSourceMappingURLs: [],
      modifiedSourceURLs: [],
      deleted: [],
    },
  ];

  const client = new HMRClient('wss://banana.com/phone');
  updates.forEach(update => sendUpdate(update));
  client.enable();
  expect(evaledCode).toMatchSnapshot();
});

test('can enable and disable the client to batch updates', () => {
  const updates: Array<HmrUpdate> = [
    {
      revisionId: 'A (add 1, 2, and 3)',
      added: [
        [1, 'function 1_A() {}'],
        [2, 'function 2_A() {}'],
        [3, 'function 3_A() {}'],
      ],
      addedSourceMappingURLs: ['1_A.js.map', '2_A.js.map', '3_A.js.map'],
      addedSourceURLs: ['1.js', '2.js', '3.js'],
      modified: [],
      modifiedSourceMappingURLs: [],
      modifiedSourceURLs: [],
      deleted: [],
    },
    {
      revisionId: 'B (add 4, edit 3 and 1)',
      added: [[4, 'function 4_B() {}']],
      addedSourceMappingURLs: ['4_B.js.map'],
      addedSourceURLs: ['4.js'],
      modified: [[3, 'function 3_B() {}'], [1, 'function 1_B() {}']],
      modifiedSourceMappingURLs: ['3_B.js.map', '1_B.js.map'],
      modifiedSourceURLs: ['3.js', '1.js'],
      deleted: [],
    },
    {
      revisionId: 'C (edit 2, delete 3)',
      added: [],
      addedSourceMappingURLs: [],
      addedSourceURLs: [],
      modified: [[2, 'function 2_C() {}']],
      modifiedSourceMappingURLs: ['2_C.js.map'],
      modifiedSourceURLs: ['2.js'],
      deleted: [3],
    },
    {
      revisionId: 'D (delete 1, add 3)',
      added: [[3, 'function 3_D() {}']],
      addedSourceMappingURLs: ['3_D.js.map'],
      addedSourceURLs: ['3.js'],
      modified: [],
      modifiedSourceMappingURLs: [],
      modifiedSourceURLs: [],
      deleted: [1],
    },
    {
      revisionId: 'E (edit 2 and 3)',
      added: [],
      addedSourceMappingURLs: [],
      addedSourceURLs: [],
      modified: [[2, 'function 2_E() {}'], [3, 'function 3_E() {}']],
      modifiedSourceMappingURLs: ['2_E.js.map', '3_E.js.map'],
      modifiedSourceURLs: ['2.js', '3.js'],
      deleted: [],
    },
  ];

  const client = new HMRClient('wss://banana.com/phone');
  client.enable();
  sendUpdate(updates[0]);
  client.disable();
  sendUpdate(updates[1]);
  sendUpdate(updates[2]);
  client.enable();
  client.disable();
  sendUpdate(updates[3]);
  sendUpdate(updates[4]);
  client.enable();

  expect(evaledCode).toMatchSnapshot();
});
