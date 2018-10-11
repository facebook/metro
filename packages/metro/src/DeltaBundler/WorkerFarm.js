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

const chalk = require('chalk');

const {Logger} = require('metro-core');
const JestWorker = require('jest-worker').default;

import type {TransformResult} from '../DeltaBundler';
import type {TransformOptions, TransformerConfig, Worker} from './Worker';
import type {ConfigT} from 'metro-config/src/configTypes.flow';

type WorkerInterface = JestWorker & Worker;

type TransformerResult = {
  result: TransformResult<>,
  sha1: string,
};

class WorkerFarm {
  _config: ConfigT;
  _transformerConfig: TransformerConfig;
  _worker: WorkerInterface;

  constructor(config: ConfigT, transformerConfig: TransformerConfig) {
    this._config = config;
    this._transformerConfig = transformerConfig;

    if (this._config.maxWorkers > 1) {
      this._worker = this._makeFarm(
        this._config.transformer.workerPath,
        ['transform'],
        this._config.maxWorkers,
      );

      this._worker.getStdout().on('data', chunk => {
        this._config.reporter.update({
          type: 'worker_stdout_chunk',
          chunk: chunk.toString('utf8'),
        });
      });
      this._worker.getStderr().on('data', chunk => {
        this._config.reporter.update({
          type: 'worker_stderr_chunk',
          chunk: chunk.toString('utf8'),
        });
      });
    } else {
      // eslint-disable-next-line lint/flow-no-fixme
      // $FlowFixMe: Flow doesn't support dynamic requires
      this._worker = require(this._config.transformer.workerPath);
    }
  }

  kill() {
    if (this._worker && typeof this._worker.end === 'function') {
      this._worker.end();
    }
  }

  async transform(
    filename: string,
    options: TransformOptions,
  ): Promise<TransformerResult> {
    try {
      const data = await this._worker.transform(
        filename,
        options,
        this._config.projectRoot,
        this._transformerConfig,
      );

      Logger.log(data.transformFileStartLogEntry);
      Logger.log(data.transformFileEndLogEntry);

      return {
        result: data.result,
        sha1: Buffer.from(data.sha1, 'hex'),
      };
    } catch (err) {
      if (err.loc) {
        throw this._formatBabelError(err, filename);
      } else {
        throw this._formatGenericError(err, filename);
      }
    }
  }

  _makeFarm(
    workerPath: string,
    exposedMethods: $ReadOnlyArray<string>,
    numWorkers: number,
  ) {
    const execArgv = process.execArgv.slice();

    // We swallow the first parameter if it's not an option (some things such as
    // flow-node like to add themselves into the execArgv array)
    if (execArgv.length > 0 && execArgv[0].charAt(0) !== '-') {
      execArgv.shift();
    }

    const env = {
      ...process.env,
      // Force color to print syntax highlighted code frames.
      FORCE_COLOR: chalk.supportsColor ? 1 : 0,
    };

    return new JestWorker(workerPath, {
      computeWorkerKey: this._computeWorkerKey,
      exposedMethods,
      forkOptions: {env, execArgv},
      numWorkers,
    });
  }

  _computeWorkerKey(method: string, filename: string): ?string {
    // Only when transforming a file we want to stick to the same worker; and
    // we'll shard by file path. If not; we return null, which tells the worker
    // to pick the first available one.
    if (method === 'transform') {
      return filename;
    }

    return null;
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
      `${err.type || 'Error'}${
        err.message.includes(filename) ? '' : ' in ' + filename
      }: ${err.message}`,
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
}

class TransformError extends SyntaxError {
  type: string = 'TransformError';

  constructor(message: string) {
    super(message);
    Error.captureStackTrace && Error.captureStackTrace(this, TransformError);
  }
}

module.exports = WorkerFarm;
