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

import type {BabelSourceMap} from '@babel/core';
import type {Options, TransformedCode} from './worker';
import type {LocalPath} from '../node-haste/lib/toLocalPath';
import type {MetroMinifier} from 'metro-minify-uglify';
import type {ResultWithMap} from 'metro-minify-uglify';
import type {DynamicRequiresBehavior} from '../ModuleGraph/worker/collectDependencies';

import typeof {transform as Transform} from './worker';

type WorkerInterface = Worker & {
  minify: MetroMinifier,
  transform: Transform,
};

type Reporters = {
  +stdoutChunk: (chunk: string) => mixed,
  +stderrChunk: (chunk: string) => mixed,
};

module.exports = class Transformer {
  _worker: WorkerInterface;
  _transformModulePath: string;
  _asyncRequireModulePath: string;
  _dynamicDepsInPackages: DynamicRequiresBehavior;
  _minifierPath: string;

  constructor(options: {|
    +maxWorkers: number,
    +minifierPath: string,
    +reporters: Reporters,
    +transformModulePath: string,
    +asyncRequireModulePath: string,
    +dynamicDepsInPackages: DynamicRequiresBehavior,
    +workerPath: ?string,
  |}) {
    this._transformModulePath = options.transformModulePath;
    this._asyncRequireModulePath = options.asyncRequireModulePath;
    this._dynamicDepsInPackages = options.dynamicDepsInPackages;
    this._minifierPath = options.minifierPath;
    const {workerPath = require.resolve('./worker')} = options;

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

  async minify(
    filename: string,
    code: string,
    sourceMap: BabelSourceMap,
  ): Promise<ResultWithMap> {
    return await this._worker.minify(
      filename,
      code,
      sourceMap,
      this._minifierPath,
    );
  }

  async transform(
    filename: string,
    localPath: LocalPath,
    code: string,
    isScript: boolean,
    options: Options,
    assetExts: $ReadOnlyArray<string>,
    assetRegistryPath: string,
  ): Promise<TransformedCode> {
    try {
      debug('Started transforming file', filename);

      const data = await this._worker.transform(
        filename,
        localPath,
        code,
        this._transformModulePath,
        isScript,
        options,
        assetExts,
        assetRegistryPath,
        this._asyncRequireModulePath,
        this._dynamicDepsInPackages,
      );

      debug('Done transforming file', filename);

      Logger.log(data.transformFileStartLogEntry);
      Logger.log(data.transformFileEndLogEntry);

      return data.result;
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
