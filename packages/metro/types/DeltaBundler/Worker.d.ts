/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {TransformResult} from './types';
import type {LogEntry} from 'metro-core/private/Logger';
import type {
  JsTransformerConfig,
  JsTransformOptions,
} from 'metro-transform-worker';

export type {JsTransformOptions as TransformOptions} from 'metro-transform-worker';
export type TransformerConfig = {
  transformerPath: string;
  transformerConfig: JsTransformerConfig;
};
type Data = Readonly<{
  result: TransformResult;
  sha1: string;
  transformFileStartLogEntry: LogEntry;
  transformFileEndLogEntry: LogEntry;
}>;
export declare const transform: (
  filename: string,
  transformOptions: JsTransformOptions,
  projectRoot: string,
  transformerConfig: TransformerConfig,
  fileBuffer?: Buffer,
) => Promise<Data>;
export declare type transform = typeof transform;
export type Worker = {readonly transform: typeof transform};
