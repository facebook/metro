/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {
  JsTransformerConfig,
  JsTransformOptions,
} from 'metro-transform-worker';
import type {TransformResult} from './types';

type LogEntry = unknown;

export type TransformOptions = JsTransformOptions;

declare function transform(
  filename: string,
  transformOptions: JsTransformOptions,
  projectRoot: string,
  transformerConfig: TransformerConfig,
  fileBuffer?: Buffer,
): Promise<Data>;

export interface Worker {
  readonly transform: typeof transform;
}

export interface TransformerConfig {
  transformerPath: string;
  transformerConfig: JsTransformerConfig;
}

interface Data {
  readonly result: TransformResult<void>;
  readonly sha1: string;
  readonly transformFileStartLogEntry: LogEntry;
  readonly transformFileEndLogEntry: LogEntry;
}

declare const worker: Worker;

export default worker;
