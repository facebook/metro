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

import type {
  FileMetadata,
  PerfLogger,
  WorkerMessage,
  WorkerMetadata,
  WorkerSetupArgs,
} from '../flow-types';

import H from '../constants';
import {Worker} from '../worker';
import {Worker as JestWorker} from 'jest-worker';
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

interface AsyncWorker {
  +processFile: WorkerMessage => Promise<WorkerMetadata>;
  +end: () => Promise<void>;
}

interface MaybeCodedError extends Error {
  code?: string;
}

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
  #workerArgs: WorkerSetupArgs;
  #inBandWorker: Worker;

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
    this.#workerArgs = {};
    this.#inBandWorker = new Worker(this.#workerArgs);
    this.#perfLogger = opts.perfLogger;
  }

  async processBatch(
    files: $ReadOnlyArray<[string /*absolutePath*/, FileMetadata]>,
    req: ProcessFileRequest,
  ): Promise<{
    errors: Array<{
      absolutePath: string,
      error: MaybeCodedError,
    }>,
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
      files.map(([absolutePath, fileMetadata]) => {
        const maybeWorkerInput = this.#getWorkerInput(
          absolutePath,
          fileMetadata,
          req,
        );
        if (!maybeWorkerInput) {
          return null;
        }
        return batchWorker
          .processFile(maybeWorkerInput)
          .then(reply => processWorkerReply(reply, fileMetadata))
          .catch(error =>
            errors.push({absolutePath, error: normalizeWorkerError(error)}),
          );
      }),
    );
    await batchWorker.end();
    return {errors};
  }

  processRegularFile(
    absolutePath: string,
    fileMetadata: FileMetadata,
    req: ProcessFileRequest,
  ): ?{content: ?Buffer} {
    const workerInput = this.#getWorkerInput(absolutePath, fileMetadata, req);
    return workerInput
      ? {
          content: processWorkerReply(
            this.#inBandWorker.processFile(workerInput),
            fileMetadata,
          ),
        }
      : null;
  }

  #getWorkerInput(
    absolutePath: string,
    fileMetadata: FileMetadata,
    req: ProcessFileRequest,
  ): ?WorkerMessage {
    const computeSha1 = req.computeSha1 && fileMetadata[H.SHA1] == null;

    const {computeDependencies, maybeReturnContent} = req;

    // Use a cheaper worker configuration for node_modules files, because we
    // never care about extracting dependencies, and they may never be Haste
    // modules or packages.
    //
    // Note that we'd only expect node_modules files to reach this point if
    // retainAllFiles is true, or they're touched during watch mode.
    if (absolutePath.includes(NODE_MODULES)) {
      if (computeSha1) {
        return {
          computeDependencies: false,
          computeSha1: true,
          dependencyExtractor: null,
          enableHastePackages: false,
          filePath: absolutePath,
          hasteImplModulePath: null,
          maybeReturnContent,
        };
      }
      return null;
    }

    return {
      computeDependencies,
      computeSha1,
      dependencyExtractor: this.#dependencyExtractor,
      enableHastePackages: this.#enableHastePackages,
      filePath: absolutePath,
      hasteImplModulePath: this.#hasteImplModulePath,
      maybeReturnContent,
    };
  }

  /**
   * Creates workers or parses files and extracts metadata in-process.
   */
  #getBatchWorker(numWorkers: number): AsyncWorker {
    if (numWorkers <= 1) {
      // In-band worker with the same interface as a Jest worker farm
      return {
        processFile: async message => this.#inBandWorker.processFile(message),
        end: async () => {},
      };
    }
    const workerPath = require.resolve('../worker');
    debug(
      'Creating worker farm of %d worker %s',
      numWorkers,
      this.#enableWorkerThreads ? 'threads' : 'processes',
    );
    this.#perfLogger?.point('initWorkers_start');
    const jestWorker = new JestWorker<{
      processFile: WorkerMessage => Promise<WorkerMetadata>,
    }>(workerPath, {
      exposedMethods: ['processFile'],
      maxRetries: 3,
      numWorkers,
      enableWorkerThreads: this.#enableWorkerThreads,
      forkOptions: {
        // Don't pass Node arguments down to workers. In particular, avoid
        // unnecessarily registering Babel when we're running Metro from
        // source (our worker is plain CommonJS).
        execArgv: [],
      },
      setupArgs: [this.#workerArgs],
    });
    this.#perfLogger?.point('initWorkers_end');
    // Only log worker init once
    this.#perfLogger = null;
    return jestWorker;
  }

  async end(): Promise<void> {}
}

function processWorkerReply(
  metadata: WorkerMetadata,
  fileMetadata: FileMetadata,
) {
  fileMetadata[H.VISITED] = 1;

  const metadataId = metadata.id;

  if (metadataId != null) {
    fileMetadata[H.ID] = metadataId;
  }

  fileMetadata[H.DEPENDENCIES] = metadata.dependencies
    ? metadata.dependencies.join(H.DEPENDENCY_DELIM)
    : '';

  if (metadata.sha1 != null) {
    fileMetadata[H.SHA1] = metadata.sha1;
  }

  return metadata.content;
}

function normalizeWorkerError(mixedError: ?Error | string): MaybeCodedError {
  if (
    mixedError == null ||
    typeof mixedError !== 'object' ||
    mixedError.message == null ||
    mixedError.stack == null
  ) {
    const error = new Error(mixedError);
    error.stack = ''; // Remove stack for stack-less errors.
    return error;
  }
  return mixedError;
}
