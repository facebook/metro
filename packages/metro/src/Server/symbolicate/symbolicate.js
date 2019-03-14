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

const concat = require('concat-stream');
const debug = require('debug')('Metro:Symbolication');
const net = require('net');
const temp = require('temp');
const xpipe = require('xpipe');

const {LazyPromise, LockingPromise} = require('./util');
const {fork} = require('child_process');

import type {MetroSourceMap} from 'metro-source-map';
import type {ChildProcess} from 'child_process';

export type Stack = Array<{file: string, lineNumber: number, column: number}>;
export type Symbolicate = (
  Stack,
  Iterable<[string, MetroSourceMap]>,
) => Promise<Stack>;

const affixes = {prefix: 'metro-symbolicate', suffix: '.sock'};
const childPath = require.resolve('./worker');

exports.createWorker = (): Symbolicate => {
  // There are issues with named sockets on windows that cause the connection to
  // close too early so run the symbolicate server on a random localhost port.
  const socket: number =
    process.platform === 'win32' ? 34712 : xpipe.eq(temp.path(affixes));
  const child = new LockingPromise(new LazyPromise(() => startupChild(socket)));

  return (stack: Stack, sourceMaps: Iterable<[string, MetroSourceMap]>) =>
    child
      .then(() => connectAndSendJob(socket, message(stack, sourceMaps)))
      .then(JSON.parse)
      .then(response =>
        'error' in response
          ? Promise.reject(new Error(response.error))
          : response.result,
      );
};

function startupChild(socket: number): Promise<ChildProcess> {
  const child = fork(childPath);
  return new Promise(
    (resolve: (result: ChildProcess) => void, reject: mixed => void): void => {
      child.once('error', reject).once('message', () => {
        child.removeAllListeners();
        resolve(child);
      });
      child.send(socket);
    },
  );
}

function connectAndSendJob(socket: number, data: string): Promise<string> {
  const job = new Promise(
    (resolve: (result: string) => void, reject: mixed => void) => {
      debug('Connecting to worker');
      const connection = net.createConnection(socket);
      connection.setEncoding('utf8');
      connection.on('error', reject);
      connection.pipe(concat(resolve));
      debug('Sending data to worker');
      connection.end(data);
    },
  );
  job.then(() => debug('Received response from worker'));
  return job;
}

function message(
  stack: Stack,
  sourceMaps: Iterable<[string, MetroSourceMap]>,
): string {
  return JSON.stringify({maps: Array.from(sourceMaps), stack});
}
