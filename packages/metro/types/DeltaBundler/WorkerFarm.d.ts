/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {TransformResult} from '../DeltaBundler';
import type {TransformerConfig, TransformOptions, Worker} from './Worker';
import type {ConfigT} from 'metro-config';
import type {Readable} from 'stream';

type WorkerInterface = Readonly<
  Omit<
    Worker,
    keyof {
      end(): void | Promise<void>;
      getStdout(): Readable;
      getStderr(): Readable;
    }
  > & {
    end(): void | Promise<void>;
    getStdout(): Readable;
    getStderr(): Readable;
  }
>;
type TransformerResult = Readonly<{result: TransformResult; sha1: string}>;
declare class WorkerFarm {
  _config: ConfigT;
  _transformerConfig: TransformerConfig;
  _worker: WorkerInterface | Worker;
  constructor(config: ConfigT, transformerConfig: TransformerConfig);
  kill(): Promise<void>;
  transform(
    filename: string,
    options: TransformOptions,
    fileBuffer?: Buffer,
  ): Promise<TransformerResult>;
  _makeFarm(
    absoluteWorkerPath: string,
    exposedMethods: ReadonlyArray<string>,
    numWorkers: number,
  ): WorkerInterface;
  _computeWorkerKey(
    method: string,
    filename: string,
  ): null | undefined | string;
  _formatGenericError(
    err: Readonly<{message: string; stack?: string}>,
    filename: string,
  ): TransformError;
  _formatBabelError(
    err: Readonly<{
      message: string;
      stack?: string;
      type?: string;
      codeFrame?: unknown;
      loc: {line?: number; column?: number};
    }>,
    filename: string,
  ): TransformError;
}
export default WorkerFarm;
declare class TransformError extends SyntaxError {
  type: string;
  constructor(message: string);
}
