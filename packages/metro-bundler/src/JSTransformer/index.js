/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @format
 */

'use strict';

const Logger = require('../Logger');

const debug = require('debug')('Metro:JStransformer');
const denodeify: Denodeify = require('denodeify');
const invariant = require('fbjs/lib/invariant');
const path = require('path');
const util = require('util');
const workerFarm = require('../worker-farm');

import type {Data as TransformData, Options as WorkerOptions} from './worker';
import type {LocalPath} from '../node-haste/lib/toLocalPath';
import type {MappingsMap} from '../lib/SourceMap';
import typeof {
  minify as Minify,
  transformAndExtractDependencies as TransformAndExtractDependencies,
} from './worker';

type CB<T> = (?Error, ?T) => mixed;
type Denodeify = (<A, B, C, T>(
  (A, B, C, CB<T>) => void,
) => (A, B, C) => Promise<T>) &
  (<A, B, C, D, E, T>(
    (A, B, C, D, E, CB<T>) => void,
  ) => (A, B, C, D, E) => Promise<T>);

// Avoid memory leaks caused in workers. This number seems to be a good enough number
// to avoid any memory leak while not slowing down initial builds.
// TODO(amasad): Once we get bundle splitting, we can drive this down a bit more.
const MAX_CALLS_PER_WORKER = 600;

// Worker will timeout if one of the callers timeout.
const TRANSFORM_TIMEOUT_INTERVAL = 601000;

// How may times can we tolerate failures from the worker.
const MAX_RETRIES = 2;

function makeFarm(worker, methods, timeout, maxConcurrentWorkers) {
  return workerFarm(
    {
      autoStart: true,
      /**
       * We whitelist only what would work. For example `--inspect` doesn't
       * work in the workers because it tries to open the same debugging port.
       * Feel free to add more cases to the RegExp. A whitelist is preferred, to
       * guarantee robustness when upgrading node, etc.
       */
      execArgv: process.execArgv.filter(
        arg =>
          /^--stack[_-]trace[_-]limit=[0-9]+$/.test(arg) ||
          /^--heap[_-]growing[_-]percent=[0-9]+$/.test(arg) ||
          /^--max[_-]old[_-]space[_-]size=[0-9]+$/.test(arg)
      ),
      maxConcurrentCallsPerWorker: 1,
      maxConcurrentWorkers,
      maxCallsPerWorker: MAX_CALLS_PER_WORKER,
      maxCallTime: timeout,
      maxRetries: MAX_RETRIES,
    },
    worker,
    methods,
  );
}

type Reporters = {
  +stdoutChunk: (chunk: string) => mixed,
  +stderrChunk: (chunk: string) => mixed,
};

class Transformer {
  _workers: {[name: string]: Function};
  _transformModulePath: string;
  _transform: (
    transform: string,
    filename: string,
    localPath: LocalPath,
    sourceCode: string,
    options: WorkerOptions,
  ) => Promise<TransformData>;
  _usesFarm: boolean;
  minify: (
    filename: string,
    code: string,
    sourceMap: ?MappingsMap,
  ) => Promise<{code: string, map: ?MappingsMap}>;

  constructor(
    transformModulePath: string,
    maxWorkers: number,
    reporters: Reporters,
    workerPath: ?string,
  ) {
    invariant(
      path.isAbsolute(transformModulePath),
      'transform module path should be absolute',
    );
    if (!workerPath) {
      workerPath = require.resolve('./worker');
    }

    this._transformModulePath = transformModulePath;
    this._usesFarm = false;
    if (maxWorkers > 1) {
      this._usesFarm = true;
      const farm = makeFarm(
        workerPath,
        ['minify', 'transformAndExtractDependencies'],
        TRANSFORM_TIMEOUT_INTERVAL,
        maxWorkers,
      );
      farm.stdout.on('data', chunk => {
        reporters.stdoutChunk(chunk.toString('utf8'));
      });
      farm.stderr.on('data', chunk => {
        reporters.stderrChunk(chunk.toString('utf8'));
      });

      this._workers = farm.methods;
    } else {
      // $FlowFixMe
      this._workers = require(workerPath);
    }
    this._transform = denodeify(
      (this._workers
        .transformAndExtractDependencies: TransformAndExtractDependencies),
    );
    this.minify = denodeify((this._workers.minify: Minify));
  }

  kill() {
    if (this._usesFarm && this._workers) {
      /* $FlowFixMe(>=0.56.0 site=react_native_fb) This comment suppresses an
       * error found when Flow v0.56 was deployed. To see the error delete this
       * comment and run Flow. */
      workerFarm.end(this._workers);
    }
  }

  transformFile(
    fileName: string,
    localPath: LocalPath,
    code: string,
    options: WorkerOptions,
  ) {
    if (!this._transform) {
      /* $FlowFixMe(>=0.54.0 site=react_native_fb) This comment suppresses an
       * error found when Flow v0.54 was deployed. To see the error delete this
       * comment and run Flow. */
      return Promise.reject(new Error('No transform module'));
    }
    debug('transforming file', fileName);
    /* $FlowFixMe(>=0.54.0 site=react_native_fb) This comment suppresses an
     * error found when Flow v0.54 was deployed. To see the error delete this
     * comment and run Flow. */
    return this._transform(
      this._transformModulePath,
      fileName,
      localPath,
      code,
      options,
    )
      .then(data => {
        Logger.log(data.transformFileStartLogEntry);
        Logger.log(data.transformFileEndLogEntry);
        debug('done transforming file', fileName);
        return data.result;
      })
      .catch(error => {
        if (error.type === 'TimeoutError') {
          const timeoutErr = new Error(
            `TimeoutError: transforming ${fileName} took longer than ` +
              `${TRANSFORM_TIMEOUT_INTERVAL / 1000} seconds.\n`,
          );
          /* $FlowFixMe: monkey-patch Error */
          timeoutErr.type = 'TimeoutError';
          throw timeoutErr;
        } else if (error.type === 'ProcessTerminatedError') {
          const uncaughtError = new Error(
            'Uncaught error in the transformer worker: ' +
              this._transformModulePath,
          );
          /* $FlowFixMe: monkey-patch Error */
          uncaughtError.type = 'ProcessTerminatedError';
          throw uncaughtError;
        }

        throw formatError(error, fileName);
      });
  }

  static TransformError;
}

Transformer.TransformError = TransformError;

function TransformError() {
  Error.captureStackTrace && Error.captureStackTrace(this, TransformError);
}
util.inherits(TransformError, SyntaxError);

function formatError(err, filename) {
  if (err.loc) {
    return formatBabelError(err, filename);
  } else {
    return formatGenericError(err, filename);
  }
}

function formatGenericError(err, filename) {
  var msg = 'TransformError: ' + filename + ': ' + err.message;
  var error = new TransformError();
  var stack = (err.stack || '').split('\n').slice(0, -1);
  error.stack = stack.join('\n');
  error.message = msg;
  error.type = 'TransformError';
  error.lineNumber = 0;
  error.description = '';
  return error;
}

function formatBabelError(err, filename) {
  var error = new TransformError();
  error.type = 'TransformError';
  error.message = `${err.type || error.type} in ${filename}: ${err.message}`;
  error.stack = err.stack;
  error.snippet = err.codeFrame;
  error.lineNumber = err.loc.line;
  error.column = err.loc.column;
  error.filename = filename;
  error.description = err.message;
  return error;
}

module.exports = Transformer;
