/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<d7a3e8ee49c1b37154e6d92065e6bd29>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/DeltaBundler/Worker.flow.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
  assetUrlPath?: string,
) => Promise<Data>;
export declare type transform = typeof transform;
export type Worker = {readonly transform: typeof transform};
