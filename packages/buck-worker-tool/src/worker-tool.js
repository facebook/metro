/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const CommandFailedError = require('./CommandFailedError');
const JSONStream = require('JSONStream');

const duplexer = require('duplexer');
const each = require('async/each');
const fs = require('fs');
const invariant = require('fbjs/lib/invariant');
const path = require('path');
const temp = require('temp');

const {Console} = require('console');

import type {Writable} from 'stream';

export type Command = (
  argv: Array<string>,
  structuredArgs: mixed,
  console: Console,
) => Promise<void> | void;
export type Commands = {[key: string]: Command};

type Message<Type: string, Data> = Data & {
  id: number,
  type: Type,
};
type HandshakeMessage = Message<
  'handshake',
  {
    protocol_version: '0',
    capabilities: [],
  },
>;
type CommandMessage = Message<
  'command',
  {
    args_path: string,
    stdout_path: string,
    stderr_path: string,
  },
>;
type UnknownMessage = Message<any, {}>;
type HandshakeReponse = HandshakeMessage;
type CommandResponse = Message<
  'result',
  {
    exit_code: 0,
  },
>;
type ErrorResponse = Message<
  'error',
  {
    exit_code: number,
  },
>;
type IncomingMessage = HandshakeMessage | CommandMessage | UnknownMessage;
type Response = HandshakeReponse | CommandResponse | ErrorResponse;
type RespondFn = (response: Response) => void;

type JSONReader = {
  on: ((
    type: 'data',
    listener: (message: IncomingMessage) => any,
  ) => JSONReader) &
    ((type: 'end') => JSONReader),
  removeListener(type: 'data' | 'end', listener: Function): JSONReader,
};
type JSONWriter = {
  write(object: Response): void,
  end(object?: Response): void,
};

function buckWorker(commands: Commands) {
  const reader: JSONReader = JSONStream.parse('*');
  const writer: JSONWriter = JSONStream.stringify();

  function handleHandshake(message: IncomingMessage) {
    const response = handShakeResponse(message);
    writer.write(response);
    if (response.type === 'handshake') {
      reader.removeListener('data', handleHandshake).on('data', handleCommand);
    }
  }

  function handleCommand(message: CommandMessage | UnknownMessage) {
    const {id} = message;
    if (message.type !== 'command') {
      writer.write(unknownMessage(id));
      return;
    }

    /* $FlowFixMe(>=0.44.0 site=react_native_fb) Flow error found while
     * deploying v0.44.0. Remove this comment to see the error */
    if (!message.args_path || !message.stdout_path || !message.stderr_path) {
      writer.write(invalidMessage(id));
      return;
    }

    let responded: boolean = false;
    let stdout, stderr;
    try {
      stdout = fs.createWriteStream(message.stdout_path);
      stderr = fs.createWriteStream(message.stderr_path);
    } catch (e) {
      respond(invalidMessage(id));
      return;
    }

    readArgsAndExecCommand(message, commands, stdout, stderr, respond);

    function respond(response: Response) {
      // 'used for lazy `.stack` access'
      invariant(!responded, `Already responded to message id ${id}.`);
      responded = true;

      each(
        [stdout, stderr].filter(Boolean),
        (stream, cb) => stream.end(cb),
        error => {
          if (error) {
            throw error;
          }
          writer.write(response);
        },
      );
    }
  }

  /* $FlowFixMe(site=react_native_fb) - Flow now prevents you from calling a
   * function with more arguments than it expects. This comment suppresses an
   * error that was noticed when we made this change. Delete this comment to
   * see the error. */
  reader.on('data', handleHandshake).on('end', () => writer.end());
  return duplexer(reader, writer);
}

function handShakeResponse(message: HandshakeMessage | UnknownMessage) {
  return message.type !== 'handshake'
    ? unknownMessage(message.id)
    : /* $FlowFixMe(>=0.44.0 site=react_native_fb) Flow error found while
     * deploying v0.44.0. Remove this comment to see the error */
      message.protocol_version !== '0'
      ? invalidMessage(message.id)
      : handshake(message.id);
}

function readArgsAndExecCommand(
  message: CommandMessage,
  commands: Commands,
  stdout: Writable,
  stderr: Writable,
  respond: RespondFn,
) {
  const {id} = message;

  fs.readFile(message.args_path, 'utf8', (readError, argsString) => {
    if (readError) {
      respond(invalidMessage(id));
      return;
    }

    let commandName;
    let args = [];
    let structuredArgs = null;

    // If it starts with a left brace, we assume it's JSON-encoded. This works
    // because the non-JSON encoding always starts the string with the
    // command name, thus a letter.
    if (argsString[0] === '{') {
      ({command: commandName, ...structuredArgs} = JSON.parse(argsString));
    } else {
      // FIXME: if there are files names with escaped
      // whitespace, this will not work.
      [commandName, ...args] = argsString.split(/\s+/);
    }

    if (commands.hasOwnProperty(commandName)) {
      const command = commands[commandName];
      const commandSpecificConsole = new Console(stdout, stderr);
      execCommand(
        command,
        commandName,
        argsString,
        args,
        structuredArgs,
        commandSpecificConsole,
        respond,
        id,
      );
    } else {
      stderr.write(
        `This worker does not have a command named \`${commandName}\`.`,
      );
      respond(invalidMessage(id));
    }
  });
}

const {JS_WORKER_TOOL_DEBUG_RE} = process.env;
const DEBUG_RE = JS_WORKER_TOOL_DEBUG_RE
  ? new RegExp(JS_WORKER_TOOL_DEBUG_RE)
  : null;

async function execCommand(
  command: Command,
  commandName: string,
  argsString: string,
  args: Array<string>,
  structuredArgs: mixed,
  commandSpecificConsole: Console,
  respond: RespondFn,
  messageId: number,
) {
  let makeResponse = success;
  try {
    if (shouldDebugCommand(argsString)) {
      throw new Error(
        `Stopping for debugging. Command '${commandName} ...' matched by the 'JS_WORKER_TOOL_DEBUG_RE' environment variable`,
      );
    }
    await command(args.slice(), structuredArgs, commandSpecificConsole);
  } catch (e) {
    if (!(e instanceof CommandFailedError)) {
      commandSpecificConsole.error(e);
    }
    makeResponse = commandError;
    displayDebugMessage(commandSpecificConsole, argsString);
  }

  respond(makeResponse(messageId));
}

function shouldDebugCommand(argsString) {
  return DEBUG_RE && DEBUG_RE.test(argsString);
}

const ENV_VARS_FOR_REPRO = ['GRAPHQL_SCHEMAS_DIR'];

function displayDebugMessage(commandSpecificConsole, argsString) {
  const binPath = path.resolve(process.cwd(), 'js/metro-buck/cli.js');

  const reproPath = temp.path({
    prefix: 'packager-buck-worker-repro.',
    suffix: '.args',
  });
  fs.writeFileSync(reproPath, argsString);
  const nodePath = process.execPath;
  const envVars = ENV_VARS_FOR_REPRO.map(
    name => `${name}='${(process.env[name] || '').replace("'", "'\\''")}'`,
  ).join(' ');
  commandSpecificConsole.error(
    '\nTo reproduce, run:\n' +
      `  ${envVars} ${nodePath} --preserve-symlinks ${binPath} ${reproPath}\n`,
  );
}

const error = (id, exitCode) => ({type: 'error', id, exit_code: exitCode});
const handshake = id => ({
  id,
  type: 'handshake',
  protocol_version: '0',
  capabilities: [],
});
const unknownMessage = id => error(id, 1);
const invalidMessage = id => error(id, 2);
const commandError = id => error(id, 3);
const success = id => ({type: 'result', id, exit_code: 0});

module.exports = buckWorker;
