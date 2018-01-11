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

const {Logger} = require('metro-core');

const debug = require('debug')('Metro:JStransformer');
const Worker = require('jest-worker').default;

import type {BabelSourceMap} from 'babel-core';
import type {Options, TransformedCode} from './worker';
import type {LocalPath} from '../node-haste/lib/toLocalPath';
import type {ResultWithMap} from './worker/minify';

import typeof {minify as Minify, transform as Transform} from './worker';

type WorkerInterface = Worker & {
  minify: Minify,
  transform: Transform,
};

type Reporters = {
  +stdoutChunk: (chunk: string) => mixed,
  +stderrChunk: (chunk: string) => mixed,
};

module.exports = class Transformer {
  _worker: WorkerInterface;
  _transformModulePath: string;

  constructor(
    transformModulePath: string,
    maxWorkers: number,
    reporters: Reporters,
    workerPath: string = require.resolve('./worker'),
  ) {
    this._transformModulePath = transformModulePath;

    if (maxWorkers > 1) {
      this._worker = this._makeFarm(
        workerPath,
        ['minify', 'transform'],
        maxWorkers,
      );

      this._worker.getStdout().on('data', chunk => {
        reporters.stdoutChunk(chunk.toString('utf8'));
      });

      this._worker.getStderr().on('data', chunk => {
        reporters.stderrChunk(chunk.toString('utf8'));
      });
    } else {
      this._worker = require(workerPath);
    }
  }

  kill() {
    if (this._worker && typeof this._worker.end === 'function') {
      this._worker.end();
    }
  }

  async minify(
    filename: string,
    code: string,
    sourceMap: BabelSourceMap,
  ): Promise<ResultWithMap> {
    return await this._worker.minify(filename, code, sourceMap);
  }

  async transformFile(
    filename: string,
    localPath: LocalPath,
    code: string,
    isScript: boolean,
    options: Options,
    assetExts: $ReadOnlyArray<string>,
    assetRegistryPath: string,
  ): Promise<TransformedCode> {
    try {
      debug('Started ransforming file', filename);

      const data = await this._worker.transform(
        this._transformModulePath,
        filename,
        localPath,
        code,
        isScript,
        options,
        assetExts,
        assetRegistryPath,
      );

      debug('Done transforming file', filename);

      Logger.log(data.transformFileStartLogEntry);
      Logger.log(data.transformFileEndLogEntry);

      return data.result;
    } catch (err) {
      debug('Failed transformFile file', filename);

      if (err.loc) {
        throw this._formatBabelError(err, filename);
      } else {
        throw this._formatGenericError(err, filename);
      }
    }
  }

  _makeFarm(workerPath, exposedMethods, maxWorkers) {
    // We whitelist only what would work. For example `--inspect` doesn't work
    // in the workers because it tries to open the same debugging port. Feel
    // free to add more cases to the RegExp. A whitelist is preferred, to
    // guarantee robustness when upgrading node, etc.
    const execArgv = process.execArgv.filter(
      arg =>
        /^--stack[_-]trace[_-]limit=[0-9]+$/.test(arg) ||
        /^--heap[_-]growing[_-]percent=[0-9]+$/.test(arg) ||
        /^--max[_-]old[_-]space[_-]size=[0-9]+$/.test(arg),
    );

    return new Worker(workerPath, {
      exposedMethods,
      forkOptions: {execArgv},
      maxWorkers,
    });
  }

  _formatGenericError(err, filename) {
    const error = new TransformError(`${filename}: ${err.message}`);

    return Object.assign(error, {
      stack: (err.stack || '')
        .split('\n')
        .slice(0, -1)
        .join('\n'),
      lineNumber: 0,
    });
  }

  _formatBabelError(err, filename) {
    const error = new TransformError(
      `${err.type || 'Error'} in ${filename}: ${err.message}`,
    );

    // $FlowFixMe: extending an error.
    return Object.assign(error, {
      stack: err.stack,
      snippet: err.codeFrame,
      lineNumber: err.loc.line,
      column: err.loc.column,
      filename,
    });
  }
};

class TransformError extends SyntaxError {
  type: string = 'TransformError';

  constructor(message: string) {
    super(message);
    Error.captureStackTrace && Error.captureStackTrace(this, TransformError);
  }
}
