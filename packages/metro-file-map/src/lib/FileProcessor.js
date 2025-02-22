/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import type {FileMetaData, PerfLogger, WorkerMetadata} from '../flow-types';
import type {IJestWorker} from 'jest-worker';

import H from '../constants';
import {worker} from '../worker';
import {Worker} from 'jest-worker';
import {sep} from 'path';

const debug = require('debug')('Metro:FileMap');

type ProcessFileRequest = $ReadOnly<{
  /**
   * Populate metadata[H.SHA1] with the SHA1 of the file's contents.
   */
  computeSha1: boolean,
  /**
   * Populate metadata[H.DEPENDENCIES] with unresolved dependency specifiers
   * using the dependencyExtractor provided to the constructor.
   */
  computeDependencies: boolean,
  /**
   * Only if processing has already required reading the file's contents, return
   * the contents as a Buffer - null otherwise. Not supported for batches.
   */
  maybeReturnContent: boolean,
}>;

type WorkerObj = {worker: typeof worker};
type WorkerInterface = IJestWorker<WorkerObj> | WorkerObj;

const NODE_MODULES = sep + 'node_modules' + sep;
const MAX_FILES_PER_WORKER = 100;

export class FileProcessor {
  #dependencyExtractor: ?string;
  #enableHastePackages: boolean;
  #hasteImplModulePath: ?string;
  #enableWorkerThreads: boolean;
  #maxFilesPerWorker: number;
  #maxWorkers: number;
  #perfLogger: ?PerfLogger;

  constructor(
    opts: $ReadOnly<{
      dependencyExtractor: ?string,
      enableHastePackages: boolean,
      enableWorkerThreads: boolean,
      hasteImplModulePath: ?string,
      maxFilesPerWorker?: ?number,
      maxWorkers: number,
      perfLogger: ?PerfLogger,
    }>,
  ) {
    this.#dependencyExtractor = opts.dependencyExtractor;
    this.#enableHastePackages = opts.enableHastePackages;
    this.#enableWorkerThreads = opts.enableWorkerThreads;
    this.#hasteImplModulePath = opts.hasteImplModulePath;
    this.#maxFilesPerWorker = opts.maxFilesPerWorker ?? MAX_FILES_PER_WORKER;
    this.#maxWorkers = opts.maxWorkers;
    this.#perfLogger = opts.perfLogger;
  }

  async processBatch(
    files: $ReadOnlyArray<[string /*absolutePath*/, FileMetaData]>,
    req: ProcessFileRequest,
  ): Promise<{
    errors: Array<{absolutePath: string, error: Error & {code: string}}>,
  }> {
    const errors = [];
    const numWorkers = Math.min(
      this.#maxWorkers,
      Math.ceil(files.length / this.#maxFilesPerWorker),
    );
    const batchWorker = this.#getBatchWorker(numWorkers);

    if (req.maybeReturnContent) {
      throw new Error(
        'Batch processing does not support returning file contents',
      );
    }

    await Promise.all(
      files.map(([absolutePath, fileMetadata]) =>
        this.#processWithWorker(
          absolutePath,
          fileMetadata,
          req,
          batchWorker.worker,
        )?.catch(error => {
          errors.push({absolutePath, error});
        }),
      ),
    );

    if (typeof batchWorker.end === 'function') {
      await batchWorker.end();
      debug('Ended worker farm');
    }

    return {errors};
  }

  processRegularFile(
    absolutePath: string,
    fileMetadata: FileMetaData,
    req: ProcessFileRequest,
  ): ?Promise<{content: ?Buffer}> {
    // Use in-band worker directly for single files.
    const result = this.#processWithWorker(
      absolutePath,
      fileMetadata,
      req,
      worker,
    );
    return result
      ? result.then(maybeContent => ({content: maybeContent}))
      : null;
  }

  #processWithWorker(
    absolutePath: string,
    fileMetadata: FileMetaData,
    req: ProcessFileRequest,
    worker: WorkerInterface['worker'],
  ): ?Promise<?Buffer> {
    const computeSha1 = req.computeSha1 && fileMetadata[H.SHA1] == null;

    // Callback called when the response from the worker is successful.
    const workerReply = (metadata: WorkerMetadata) => {
      fileMetadata[H.VISITED] = 1;

      const metadataId = metadata.id;

      if (metadataId != null) {
        fileMetadata[H.ID] = metadataId;
      }

      fileMetadata[H.DEPENDENCIES] = metadata.dependencies
        ? metadata.dependencies.join(H.DEPENDENCY_DELIM)
        : '';

      if (computeSha1) {
        fileMetadata[H.SHA1] = metadata.sha1;
      }

      return metadata.content;
    };

    // Callback called when the response from the worker is an error.
    const workerError = (error: mixed) => {
      if (
        error == null ||
        typeof error !== 'object' ||
        error.message == null ||
        error.stack == null
      ) {
        // $FlowFixMe[reassign-const] - Refactor this
        error = new Error(error);
        // $FlowFixMe[incompatible-use] - error is mixed
        error.stack = ''; // Remove stack for stack-less errors.
      }
      throw error;
    };

    const {computeDependencies, maybeReturnContent} = req;

    // Use a cheaper worker configuration for node_modules files, because we
    // never care about extracting dependencies, and they may never be Haste
    // modules or packages.
    //
    // Note that we'd only expect node_modules files to reach this point if
    // retainAllFiles is true, or they're touched during watch mode.
    if (absolutePath.includes(NODE_MODULES)) {
      if (computeSha1) {
        return worker({
          computeDependencies: false,
          computeSha1: true,
          dependencyExtractor: null,
          enableHastePackages: false,
          filePath: absolutePath,
          hasteImplModulePath: null,
          maybeReturnContent,
        }).then(workerReply, workerError);
      }
      return null;
    }

    return worker({
      computeDependencies,
      computeSha1,
      dependencyExtractor: this.#dependencyExtractor,
      enableHastePackages: this.#enableHastePackages,
      filePath: absolutePath,
      hasteImplModulePath: this.#hasteImplModulePath,
      maybeReturnContent,
    }).then(workerReply, workerError);
  }

  /**
   * Creates workers or parses files and extracts metadata in-process.
   */
  #getBatchWorker(numWorkers: number): WorkerInterface {
    if (numWorkers <= 1) {
      return {worker};
    }
    const workerPath = require.resolve('../worker');
    debug(
      'Creating worker farm of %d worker %s',
      numWorkers,
      this.#enableWorkerThreads ? 'threads' : 'processes',
    );
    this.#perfLogger?.point('initWorkers_start');
    const jestWorker = new Worker<WorkerObj>(workerPath, {
      exposedMethods: ['worker'],
      maxRetries: 3,
      numWorkers,
      enableWorkerThreads: this.#enableWorkerThreads,
      forkOptions: {
        // Don't pass Node arguments down to workers. In particular, avoid
        // unnecessarily registering Babel when we're running Metro from
        // source (our worker is plain CommonJS).
        execArgv: [],
      },
    });
    this.#perfLogger?.point('initWorkers_end');
    // Only log worker init once
    this.#perfLogger = null;
    return jestWorker;
  }

  async end(): Promise<void> {}
}
