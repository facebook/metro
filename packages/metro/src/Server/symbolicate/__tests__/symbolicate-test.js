/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+js_symbolication
 */
'use strict';

jest.mock('child_process').mock('net');

const EventEmitter = require('events');
const {Readable} = require('stream');
const {createWorker} = require('../symbolicate');
const {getDefaultValues} = require('metro-config/src/defaults');

let childProcess, socketResponse, socket, worker;

function setupWithConfig(config) {
  jest.restoreAllMocks();
  childProcess = Object.assign(new EventEmitter(), {send: jest.fn()});
  require('child_process').fork.mockReturnValue(childProcess);
  setupCommunication();

  socketResponse = '{"error": "no fake socket response set"}';
  socket = Object.assign(new Readable(), {
    _read() {
      this.push(socketResponse);
      this.push(null);
    },
    end: jest.fn(),
    setEncoding: jest.fn(),
  });
  require('net').createConnection.mockImplementation(() => socket);

  worker = createWorker(config);
}

beforeEach(() => {
  setupWithConfig(getDefaultValues());
});

it('sends a socket path to the child process', () => {
  socketResponse = '{"result": []}';
  return worker([], fakeSourceMaps()).then(() =>
    expect(childProcess.send).toBeCalledWith(expect.any(String)),
  );
});

it('fails if the child process emits an error', () => {
  const error = new Error('Expected error');
  childProcess.send.mockImplementation(() => childProcess.emit('error', error));

  expect.assertions(1);
  return worker([], fakeSourceMaps()).catch(e => expect(e).toBe(error));
});

it('fails if the socket connection emits an error', () => {
  const error = new Error('Expected error');
  socket._read = () => socket.emit('error', error);

  expect.assertions(1);
  return worker([], fakeSourceMaps()).catch(e => expect(e).toBe(error));
});

it('sends the passed in stack and maps over the socket', () => {
  socketResponse = '{"result": []}';
  const stack = [{file: 'minified', line: 1, column: 1}];
  return worker(stack, fakeSourceMaps()).then(() =>
    expect(socket.end).toBeCalledWith(
      JSON.stringify({
        maps: Array.from(fakeSourceMaps()),
        stack: [{file: 'minified', line: 1, column: 1}],
      }),
    ),
  );
});

it('resolves to the `result` property of the message returned over the socket', () => {
  socketResponse = '{"result": [{"file": "a", "line": 1, "column": 1}]}';
  return worker([], fakeSourceMaps()).then(response =>
    expect(response).toEqual([
      {file: 'a', line: 1, column: 1, collapse: false},
    ]),
  );
});

it('rejects with the `error` property of the message returned over the socket', () => {
  socketResponse = '{"error": "the error message"}';

  expect.assertions(1);
  return worker([], fakeSourceMaps()).catch(error =>
    expect(error).toEqual(new Error('the error message')),
  );
});

it('rejects if the socket response cannot be parsed as JSON', () => {
  socketResponse = '{';

  expect.assertions(1);
  return worker([], fakeSourceMaps()).catch(error =>
    expect(error).toBeInstanceOf(SyntaxError),
  );
});

describe('customizeFrame', () => {
  it('allows customizing frames with customizeFrame', () => {
    const defaults = getDefaultValues();
    setupWithConfig({
      ...defaults,
      symbolicator: {
        ...defaults.symbolicator,
        customizeFrame: ({file, line, column, methodName}) => ({
          collapse:
            file === 'a' &&
            line === 1 &&
            column === 1 &&
            methodName === 'method',
        }),
      },
    });
    socketResponse = JSON.stringify({
      result: [
        {file: 'a', line: 1, column: 1, methodName: 'method'},
        {file: 'b', line: 1, column: 1, methodName: 'method'},
      ],
    });
    return worker([], fakeSourceMaps()).then(response =>
      expect(response).toEqual([
        {file: 'a', line: 1, column: 1, methodName: 'method', collapse: true},
        {file: 'b', line: 1, column: 1, methodName: 'method', collapse: false},
      ]),
    );
  });

  it('can be an async function', () => {
    const defaults = getDefaultValues();
    setupWithConfig({
      ...defaults,
      symbolicator: {
        ...defaults.symbolicator,
        customizeFrame: async ({file, line, column, methodName}) => ({
          collapse:
            file === 'a' &&
            line === 1 &&
            column === 1 &&
            methodName === 'method',
        }),
      },
    });
    socketResponse = JSON.stringify({
      result: [
        {file: 'a', line: 1, column: 1, methodName: 'method'},
        {file: 'b', line: 1, column: 1, methodName: 'method'},
      ],
    });
    return worker([], fakeSourceMaps()).then(response =>
      expect(response).toEqual([
        {file: 'a', line: 1, column: 1, methodName: 'method', collapse: true},
        {file: 'b', line: 1, column: 1, methodName: 'method', collapse: false},
      ]),
    );
  });
});

function setupCommunication() {
  childProcess.send.mockImplementation(() =>
    process.nextTick(() => childProcess.emit('message')),
  );
}

function* fakeSourceMaps() {
  yield [1, {}];
  yield [2, {}];
}
