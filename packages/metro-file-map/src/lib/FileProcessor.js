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
import nullthrows from 'nullthrows';
import {sep} from 'path';

const debug = require('debug')('Metro:FileMap');

type ProcessFileRequest = $ReadOnly<{
  computeSha1: boolean,
  computeDependencies: boolean,
  forceInBand: boolean,
}>;

type WorkerObj = {worker: typeof worker};
type WorkerInterface = IJestWorker<WorkerObj> | WorkerObj;

const NODE_MODULES = sep + 'node_modules' + sep;

export class FileProcessor {
  #dependencyExtractor: ?string;
  #enableHastePackages: boolean;
  #hasteImplModulePath: ?string;
  #enableWorkerThreads: boolean;
  #maxWorkers: number;
  #perfLogger: ?PerfLogger;
  #worker: ?WorkerInterface;

  constructor(
    opts: $ReadOnly<{
      dependencyExtractor: ?string,
      enableHastePackages: boolean,
      enableWorkerThreads: boolean,
      hasteImplModulePath: ?string,
      maxWorkers: number,
      perfLogger: ?PerfLogger,
    }>,
  ) {
    this.#dependencyExtractor = opts.dependencyExtractor;
    this.#enableHastePackages = opts.enableHastePackages;
    this.#enableWorkerThreads = opts.enableWorkerThreads;
    this.#hasteImplModulePath = opts.hasteImplModulePath;
    this.#maxWorkers = opts.maxWorkers;
    this.#perfLogger = opts.perfLogger;
  }

  processRegularFile(
    absolutePath: string,
    fileMetadata: FileMetaData,
    req: ProcessFileRequest,
  ): ?Promise<void> {
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

    // Use a cheaper worker configuration for node_modules files, because we
    // never care about extracting dependencies, and they may never be Haste
    // modules or packages.
    //
    // Note that we'd only expect node_modules files to reach this point if
    // retainAllFiles is true, or they're touched during watch mode.
    if (absolutePath.includes(NODE_MODULES)) {
      if (computeSha1) {
        return this.#getWorker(req.forceInBand)
          .worker({
            computeDependencies: false,
            computeSha1: true,
            dependencyExtractor: null,
            enableHastePackages: false,
            filePath: absolutePath,
            hasteImplModulePath: null,
          })
          .then(workerReply, workerError);
      }
      return null;
    }

    return this.#getWorker(req.forceInBand)
      .worker({
        computeDependencies: req.computeDependencies,
        computeSha1,
        dependencyExtractor: this.#dependencyExtractor,
        enableHastePackages: this.#enableHastePackages,
        filePath: absolutePath,
        hasteImplModulePath: this.#hasteImplModulePath,
      })
      .then(workerReply, workerError);
  }

  /**
   * Creates workers or parses files and extracts metadata in-process.
   */
  #getWorker(forceInBand: boolean): WorkerInterface {
    if (!this.#worker) {
      if (forceInBand || this.#maxWorkers <= 1) {
        this.#worker = {worker};
      } else {
        const workerPath = require.resolve('../worker');
        debug(
          'Creating worker farm of %d worker %s',
          this.#maxWorkers,
          this.#enableWorkerThreads ? 'threads' : 'processes',
        );
        this.#perfLogger?.point('initWorkers_start');
        this.#worker = new Worker<WorkerObj>(workerPath, {
          exposedMethods: ['worker'],
          maxRetries: 3,
          numWorkers: this.#maxWorkers,
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
      }
    }
    return nullthrows(this.#worker);
  }

  async freeWorkers(): Promise<void> {
    const worker = this.#worker;

    if (worker && typeof worker.end === 'function') {
      await worker.end();
      debug('Worker farm ended');
    }

    this.#worker = null;
  }
}
