/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<0bcc56baaa3cab86e03f6ac13b6ecb9a>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/Bundler.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {TransformResultWithSource} from './DeltaBundler';
import type {TransformOptions} from './DeltaBundler/Worker';
import type EventEmitter from 'events';
import type {ConfigT} from 'metro-config';

import Transformer from './DeltaBundler/Transformer';
import DependencyGraph from './node-haste/DependencyGraph';

export type BundlerOptions = Readonly<{
  hasReducedPerformance?: boolean;
  watch?: boolean;
}>;
declare class Bundler {
  _depGraph: DependencyGraph;
  _initializedPromise: Promise<void>;
  _transformer: null | undefined | Transformer;
  constructor(config: ConfigT, options?: BundlerOptions);
  getWatcher(): EventEmitter;
  end(): Promise<void>;
  getDependencyGraph(): Promise<DependencyGraph>;
  transformFile(
    filePath: string,
    transformOptions: TransformOptions,
    fileBuffer?: Buffer,
  ): Promise<TransformResultWithSource>;
  ready(): Promise<void>;
}
export default Bundler;
