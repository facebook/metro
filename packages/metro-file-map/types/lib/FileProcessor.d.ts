/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {FileMetadata, PerfLogger} from '../flow-types';

type ProcessFileRequest = Readonly<{
  /**
   * Populate metadata[H.SHA1] with the SHA1 of the file's contents.
   */
  computeSha1: boolean;
  /**
   * Populate metadata[H.DEPENDENCIES] with unresolved dependency specifiers
   * using the dependencyExtractor provided to the constructor.
   */
  computeDependencies: boolean;
  /**
   * Only if processing has already required reading the file's contents, return
   * the contents as a Buffer - null otherwise. Not supported for batches.
   */
  maybeReturnContent: boolean;
}>;
interface MaybeCodedError extends Error {
  code?: string;
}
export declare class FileProcessor {
  constructor(
    opts: Readonly<{
      dependencyExtractor: null | undefined | string;
      enableHastePackages: boolean;
      enableWorkerThreads: boolean;
      hasteImplModulePath: null | undefined | string;
      maxFilesPerWorker?: null | undefined | number;
      maxWorkers: number;
      perfLogger: null | undefined | PerfLogger;
    }>,
  );
  processBatch(
    files: ReadonlyArray<[string, FileMetadata]>,
    req: ProcessFileRequest,
  ): Promise<{
    errors: Array<{absolutePath: string; error: MaybeCodedError}>;
  }>;
  processRegularFile(
    absolutePath: string,
    fileMetadata: FileMetadata,
    req: ProcessFileRequest,
  ): null | undefined | {content: null | undefined | Buffer};
  end(): Promise<void>;
}
