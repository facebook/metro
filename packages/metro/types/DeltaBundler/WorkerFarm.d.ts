/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<bbd52f1dc5e4a9253455034b585115ac>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/DeltaBundler/WorkerFarm.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
