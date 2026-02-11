/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {TransformResult, TransformResultWithSource} from '../DeltaBundler';
import type {TransformOptions} from './Worker';
import type {ConfigT} from 'metro-config';

import WorkerFarm from './WorkerFarm';
import {Cache} from 'metro-cache';

type GetOrComputeSha1Fn = (
  $$PARAM_0$$: string,
) => Promise<Readonly<{content?: Buffer; sha1: string}>>;
declare class Transformer {
  _config: ConfigT;
  _cache: Cache<TransformResult>;
  _baseHash: string;
  _getSha1: GetOrComputeSha1Fn;
  _workerFarm: WorkerFarm;
  constructor(
    config: ConfigT,
    opts: Readonly<{getOrComputeSha1: GetOrComputeSha1Fn}>,
  );
  transformFile(
    filePath: string,
    transformerOptions: TransformOptions,
    fileBuffer?: Buffer,
  ): Promise<TransformResultWithSource>;
  end(): Promise<void>;
}
export default Transformer;
