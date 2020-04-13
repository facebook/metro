/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 */

'use strict';

jest
  .mock('console')
  .mock('fs', () => new (require('metro-memory-fs'))())
  .mock('temp', () => ({
    path() {
      return '/tmp/repro.args';
    },
  }))
  .useRealTimers();

const JSONStream = require('JSONStream');
const buckWorker = require('../worker-tool');
const path = require('path');
const mkdirp = require('mkdirp');

// mocked
const {Console} = require('console');
const fs = require('fs');

const {any, anything} = expect;

const UNKNOWN_MESSAGE = 1;
const INVALID_MESSAGE = 2;

describe('Buck worker:', () => {
  let commands, inStream, worker, written;

  beforeEach(() => {
    commands = {};
    worker = buckWorker(commands);

    inStream = JSONStream.stringify();
    inStream.pipe(worker);
    written = [];
    worker.on('data', chunk => written.push(chunk));
  });

  describe('handshake:', () => {
    it('responds to a correct handshake', () => {
      inStream.write(handshake());

      return end().then(data => expect(data).toEqual([handshake()]));
    });

    it('responds to a handshake with a `protocol_version` different from "0"', () => {
      inStream.write({
        id: 0,
        type: 'handshake',
        protocol_version: '2',
        capabilities: [],
      });

      return end().then(responses =>
        expect(responses).toEqual([
          {
            id: 0,
            type: 'error',
            exit_code: INVALID_MESSAGE,
          },
        ]),
      );
    });

    it('errors for a second handshake', () => {
      inStream.write(handshake());
      inStream.write(handshake(1));

      return end().then(([, response]) =>
        expect(response).toEqual({
          id: 1,
          type: 'error',
          exit_code: UNKNOWN_MESSAGE,
        }),
      );
    });
  });

  it('errors for unknown message types', () => {
    inStream.write(handshake());
    inStream.write({id: 1, type: 'arbitrary'});
    return end().then(([, response]) =>
      expect(response).toEqual({
        id: 1,
        type: 'error',
        exit_code: UNKNOWN_MESSAGE,
      }),
    );
  });

  describe('commands:', () => {
    let createWriteStreamImpl, openedStreams;

    function mockFiles(files) {
      writeFiles(files, '/');
    }

    function writeFiles(files, dirPath) {
      for (const key in files) {
        const entry = files[key];
        if (entry == null || typeof entry === 'string') {
          fs.writeFileSync(path.join(dirPath, key), entry || '');
        } else {
          const subDirPath = path.join(dirPath, key);
          mkdirp.sync(subDirPath);
          writeFiles(entry, subDirPath);
        }
      }
    }

    beforeAll(() => {
      createWriteStreamImpl = fs.createWriteStream;
      fs.createWriteStream = (...args) => {
        const writeStream = createWriteStreamImpl(...args);
        ++openedStreams;
        writeStream.on('close', () => --openedStreams);
        return writeStream;
      };
    });

    afterAll(() => {
      fs.createWriteStream = createWriteStreamImpl;
    });

    beforeEach(() => {
      fs.reset();
      openedStreams = 0;
      mockFiles({
        arbitrary: {
          args: '',
          stdout: '',
          stderr: '',
        },
        // When an error happens, the worker writes a repro file to the
        // temporary folder.
        tmp: {},
      });

      inStream.write(handshake());
    });

    afterEach(function assertThatAllWriteStreamsWereClosed() {
      expect(openedStreams).toBe(0);
    });

    it('errors if `args_path` cannot be opened', () => {
      mockFiles({some: {'args-path': undefined}});
      inStream.write(command({id: 5, args_path: '/some/args-path'}));
      return end(2).then(([, response]) => {
        expect(response).toEqual({
          id: 5,
          type: 'error',
          exit_code: INVALID_MESSAGE,
        });
      });
    });

    it('errors if `stdout_path` cannot be opened', () => {
      const path = '/does/not/exist';
      inStream.write(command({id: 5, stdout_path: path}));
      return end(2).then(([, response]) => {
        expect(response).toEqual({
          id: 5,
          type: 'error',
          exit_code: INVALID_MESSAGE,
        });
      });
    });

    it('errors if `stderr_path` cannot be opened', () => {
      const path = '/does/not/exist';
      inStream.write(command({id: 5, stderr_path: path}));
      return end(2).then(([, response]) => {
        expect(response).toEqual({
          id: 5,
          type: 'error',
          exit_code: INVALID_MESSAGE,
        });
      });
    });

    it('errors for unspecified commands', () => {
      mockFiles({
        arbitrary: {
          file: '--flag-without-preceding-command',
        },
      });

      inStream.write(
        command({
          id: 1,
          args_path: '/arbitrary/file',
        }),
      );
      return end(2).then(([, response]) =>
        expect(response).toEqual({
          id: 1,
          type: 'error',
          exit_code: INVALID_MESSAGE,
        }),
      );
    });

    it('errors for empty commands', () => {
      mockFiles({
        arbitrary: {
          file: '',
        },
      });

      inStream.write(
        command({
          id: 2,
          args_path: '/arbitrary/file',
        }),
      );
      return end(2).then(([, response]) =>
        expect(response).toEqual({
          id: 2,
          type: 'error',
          exit_code: INVALID_MESSAGE,
        }),
      );
    });

    it('errors for unknown commands', () => {
      mockFiles({
        arbitrary: {
          file: 'arbitrary',
        },
      });

      inStream.write(
        command({
          id: 3,
          args_path: '/arbitrary/file',
        }),
      );
      return end(2).then(([, response]) =>
        expect(response).toEqual({
          id: 3,
          type: 'error',
          exit_code: INVALID_MESSAGE,
        }),
      );
    });

    it('errors if no `args_path` is specified', () => {
      inStream.write({
        id: 1,
        type: 'command',
        stdout_path: '/arbitrary',
        stderr_path: '/arbitrary',
      });
      return end().then(([, response]) =>
        expect(response).toEqual({
          id: 1,
          type: 'error',
          exit_code: INVALID_MESSAGE,
        }),
      );
    });

    it('errors if no `stdout_path` is specified', () => {
      inStream.write({
        id: 1,
        type: 'command',
        args_path: '/arbitrary',
        stderr_path: '/arbitrary',
      });
      return end().then(([, response]) =>
        expect(response).toEqual({
          id: 1,
          type: 'error',
          exit_code: INVALID_MESSAGE,
        }),
      );
    });

    it('errors if no `stderr_path` is specified', () => {
      inStream.write({
        id: 1,
        type: 'command',
        args_path: '/arbitrary',
        stdout_path: '/arbitrary',
      });
      return end(2).then(([, response]) =>
        expect(response).toEqual({
          id: 1,
          type: 'error',
          exit_code: INVALID_MESSAGE,
        }),
      );
    });

    it('passes arguments to an existing command', () => {
      commands.transform = jest.fn();
      const args = 'foo  bar baz\tmore';
      mockFiles({
        arbitrary: {
          file: 'transform ' + args,
        },
      });

      inStream.write(
        command({
          args_path: '/arbitrary/file',
        }),
      );

      return end(1).then(() =>
        expect(commands.transform).toBeCalledWith(
          args.split(/\s+/),
          null,
          anything(),
        ),
      );
    });

    it('passes JSON/structured arguments to an existing command', async () => {
      commands.transform = jest.fn();
      const args = {foo: 'bar', baz: 'glo'};
      mockFiles({
        arbitrary: {
          file: JSON.stringify({...args, command: 'transform'}),
        },
      });

      inStream.write(
        command({
          args_path: '/arbitrary/file',
        }),
      );

      await end(1);
      expect(commands.transform).toBeCalledWith([], args, anything());
    });

    it('passes a console object to the command', () => {
      mockFiles({
        args: 'transform',
        stdio: {},
      });

      commands.transform = jest.fn();

      inStream.write(
        command({
          args_path: '/args',
          stdout_path: '/stdio/out',
          stderr_path: '/stdio/err',
        }),
      );

      return end().then(() => {
        const streams = last(Console.mock.calls);
        expect(streams[0].path).toEqual('/stdio/out');
        expect(streams[1].path).toEqual('/stdio/err');
        expect(commands.transform).toBeCalledWith(
          anything(),
          null,
          any(Console),
        );
      });
    });

    it('responds with success if the command finishes succesfully', () => {
      commands.transform = (args, _) => {};
      mockFiles({path: {to: {args: 'transform'}}});
      inStream.write(
        command({
          id: 123,
          args_path: '/path/to/args',
        }),
      );

      return end(2).then(([, response]) =>
        expect(response).toEqual({
          id: 123,
          type: 'result',
          exit_code: 0,
        }),
      );
    });

    it('responds with error if the command does not exist', async () => {
      commands.transform = jest.fn(() => Promise.resolve());
      mockFiles({path: {to: {args: 'inexistent_command'}}});
      inStream.write(
        command({
          id: 123,
          args_path: '/path/to/args',
        }),
      );

      const [, response] = await end(2);
      expect(response).toEqual({
        id: 123,
        type: 'error',
        exit_code: 2,
      });
      expect(fs.readFileSync('/arbitrary/stderr', 'utf8')).toEqual(
        'This worker does not have a command named `inexistent_command`. Available commands are: transform',
      );
    });

    it('responds with error if the command errors asynchronously', () => {
      commands.transform = jest.fn((args, _, callback) =>
        Promise.reject(new Error('arbitrary')),
      );
      mockFiles({path: {to: {args: 'transform'}}});
      inStream.write(
        command({
          id: 123,
          args_path: '/path/to/args',
        }),
      );

      return end(2).then(([, response]) =>
        expect(response).toEqual({
          id: 123,
          type: 'error',
          exit_code: 3,
        }),
      );
    });

    it('responds with error if the command throws synchronously', () => {
      commands.transform = (args, _) => {
        throw new Error('arbitrary');
      };
      mockFiles({path: {to: {args: 'transform'}}});
      inStream.write(
        command({
          id: 456,
          args_path: '/path/to/args',
        }),
      );

      return end(2).then(([, response]) =>
        expect(response).toEqual({
          id: 456,
          type: 'error',
          exit_code: 3,
        }),
      );
    });
  });

  function end(afterMessages) {
    return new Promise((resolve, reject) => {
      worker.once('error', reject).once('end', () => resolve(written.join('')));

      if (afterMessages == null || written.length >= afterMessages) {
        inStream.end();
      } else {
        worker.on('data', () => {
          if (written.length === afterMessages) {
            inStream.end();
          }
        });
      }
    }).then(JSON.parse);
  }
});

function command(overrides) {
  return {
    id: 4, // chosen by fair dice roll
    type: 'command',
    args_path: '/arbitrary/args',
    stdout_path: '/arbitrary/stdout',
    stderr_path: '/arbitrary/stderr',
    ...overrides,
  };
}

function handshake(id = 0) {
  return {
    id,
    type: 'handshake',
    protocol_version: '0',
    capabilities: [],
  };
}

function last(arrayLike) {
  return arrayLike[arrayLike.length - 1];
}
