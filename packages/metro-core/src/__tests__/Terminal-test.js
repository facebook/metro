/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

jest.mock('readline', () => ({
  moveCursor: (stream, dx, dy, callback = () => {}) => {
    const {cursor, columns} = stream;
    stream.cursor =
      Math.max(cursor - (cursor % columns), cursor + dx) + dy * columns;
    setTimeout(callback, 33);
  },
  clearLine: (stream, dir, callback = () => {}) => {
    if (dir !== 0) {
      throw new Error('unsupported');
    }
    const {cursor, columns} = stream;
    const curLine = cursor - (cursor % columns);
    const nextLine = curLine + columns;
    for (var i = curLine; i < nextLine; ++i) {
      stream.buffer[i] = ' ';
    }
    setTimeout(callback, 33);
  },
  clearScreenDown: (stream, callback = () => {}) => {
    const {cursor, columns, lines} = stream;
    const curLine = cursor - (cursor % columns);
    for (var i = curLine; i < columns * lines; ++i) {
      stream.buffer[i] = ' ';
    }
    setTimeout(callback, 33);
  },
}));

describe('Terminal', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  function prepare(isTTY) {
    const Terminal = require('../Terminal');
    const lines = 10;
    const columns = 10;
    const stream = Object.create(
      isTTY ? require('tty').WriteStream.prototype : require('net').Socket,
    );
    Object.assign(stream, {
      cursor: 0,
      buffer: ' '.repeat(columns * lines).split(''),
      columns,
      lines,
      write(str, callback = () => {}) {
        for (let i = 0; i < str.length; ++i) {
          if (str[i] === '\n') {
            this.cursor = this.cursor - (this.cursor % columns) + columns;
          } else {
            this.buffer[this.cursor] = str[i];
            ++this.cursor;
          }
        }
        setTimeout(callback, 33);
      },
    });
    return {stream, terminal: new Terminal(stream)};
  }

  jest.useRealTimers();

  test('is not printing status to non-interactive terminal', async () => {
    const {stream, terminal} = prepare(false);
    terminal.log('foo %s', 'smth');
    terminal.status('status');
    terminal.log('bar');
    await terminal.waitForUpdates();
    expect(stream.buffer.join('').trim()).toEqual('foo smth  bar');
  });

  test('print status', async () => {
    const {stream, terminal} = prepare(true);
    terminal.log('foo');
    terminal.status('status');
    await terminal.waitForUpdates();
    expect(stream.buffer.join('').trim()).toEqual('foo       status');
  });

  test('updates status when logging, single line', async () => {
    const {stream, terminal} = prepare(true);
    terminal.log('foo');
    terminal.status('status');
    terminal.status('status2');
    terminal.log('bar');
    await terminal.waitForUpdates();
    expect(stream.buffer.join('').trim()).toEqual(
      'foo       bar       status2',
    );
    terminal.log('beep');
    await terminal.waitForUpdates();
    expect(stream.buffer.join('').trim()).toEqual(
      'foo       bar       beep      status2',
    );
  });

  test('updates status when logging, multi-line', async () => {
    const {stream, terminal} = prepare(true);
    terminal.log('foo');
    terminal.status('status\nanother');
    terminal.log('bar');
    await terminal.waitForUpdates();
    expect(stream.buffer.join('').trim()).toEqual(
      'foo       bar       status    another',
    );
  });

  test('persists status', async () => {
    const {stream, terminal} = prepare(true);
    terminal.log('foo');
    terminal.status('status');
    terminal.persistStatus();
    terminal.log('bar');
    await terminal.waitForUpdates();
    expect(stream.buffer.join('').trim()).toEqual('foo       status    bar');
  });

  test('flush- single line', async () => {
    const {stream, terminal} = prepare(true);
    terminal.log('foo');
    terminal.status('status');
    terminal.status('status2');
    terminal.log('bar');
    await terminal.flush();
    expect(stream.buffer.join('').trim()).toEqual(
      'foo       bar       status2',
    );
    terminal.log('beep');
    await terminal.flush();
    expect(stream.buffer.join('').trim()).toEqual(
      'foo       bar       beep      status2',
    );
  });

  test('flush- multi-line', async () => {
    const {stream, terminal} = prepare(true);
    terminal.log('foo');
    terminal.status('status\nanother');
    terminal.log('bar');
    await terminal.flush();
    expect(stream.buffer.join('').trim()).toEqual(
      'foo       bar       status    another',
    );
  });
});
