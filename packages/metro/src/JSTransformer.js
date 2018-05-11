/**
 * Copyright (c) 2015-present, Facebook, Inc.
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
const debug = require('debug')('Metro:JStransformer');
const Worker = require('jest-worker').default;

import type {TransformResult} from './DeltaBundler';
import type {WorkerOptions} from './JSTransformer/worker';
import type {LocalPath} from './node-haste/lib/toLocalPath';
import type {DynamicRequiresBehavior} from './ModuleGraph/worker/collectDependencies';

import typeof {transform as Transform} from './JSTransformer/worker';

type WorkerInterface = Worker & {
  transform: Transform,
};

type Reporters = {
  +stdoutChunk: (chunk: string) => mixed,
  +stderrChunk: (chunk: string) => mixed,
};

type TransformerResult = {
  result: TransformResult<>,
  sha1: string,
};

module.exports = class Transformer {
  _worker: WorkerInterface;
  _transformModulePath: string;
  _asyncRequireModulePath: string;
  _dynamicDepsInPackages: DynamicRequiresBehavior;

  constructor(options: {|
    +maxWorkers: number,
    +reporters: Reporters,
    +transformModulePath: string,
    +asyncRequireModulePath: string,
    +dynamicDepsInPackages: DynamicRequiresBehavior,
    +workerPath: ?string,
  |}) {
    this._transformModulePath = options.transformModulePath;
    this._asyncRequireModulePath = options.asyncRequireModulePath;
    this._dynamicDepsInPackages = options.dynamicDepsInPackages;
    const {workerPath = require.resolve('./JSTransformer/worker')} = options;

    if (options.maxWorkers > 1) {
      this._worker = this._makeFarm(
        workerPath,
        this._computeWorkerKey,
        ['minify', 'transform'],
        options.maxWorkers,
      );

      const {reporters} = options;
      this._worker.getStdout().on('data', chunk => {
        reporters.stdoutChunk(chunk.toString('utf8'));
      });
      this._worker.getStderr().on('data', chunk => {
        reporters.stderrChunk(chunk.toString('utf8'));
      });
    } else {
      // eslint-disable-next-line lint/flow-no-fixme
      // $FlowFixMe: Flow doesn't support dynamic requires
      this._worker = require(workerPath);
    }
  }

  kill() {
    if (this._worker && typeof this._worker.end === 'function') {
      this._worker.end();
    }
  }

  async transform(
    filename: string,
    localPath: LocalPath,
    options: WorkerOptions,
    assetExts: $ReadOnlyArray<string>,
    assetRegistryPath: string,
    minifierPath: string,
  ): Promise<TransformerResult> {
    try {
      debug('Started transforming file', filename);

      const data = await this._worker.transform(
        filename,
        localPath,
        this._transformModulePath,
        options,
        assetExts,
        assetRegistryPath,
        minifierPath,
        this._asyncRequireModulePath,
        this._dynamicDepsInPackages,
      );

      debug('Done transforming file', filename);

      Logger.log(data.transformFileStartLogEntry);
      Logger.log(data.transformFileEndLogEntry);

      return {
        result: data.result,
        sha1: Buffer.from(data.sha1, 'hex'),
      };
    } catch (err) {
      debug('Failed transform file', filename);

      if (err.loc) {
        throw this._formatBabelError(err, filename);
      } else {
        throw this._formatGenericError(err, filename);
      }
    }
  }

  _makeFarm(workerPath, computeWorkerKey, exposedMethods, numWorkers) {
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
    const env = {
      ...process.env,
      // Force color to print syntax highlighted code frames.
      FORCE_COLOR: chalk.supportsColor ? 1 : 0,
    };

    return new Worker(workerPath, {
      computeWorkerKey,
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
};

class TransformError extends SyntaxError {
  type: string = 'TransformError';

  constructor(message: string) {
    super(message);
    Error.captureStackTrace && Error.captureStackTrace(this, TransformError);
  }
}
