/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {ModuleTransportLike} from '../../shared/types';
import type {Module, ReadOnlyGraph, SerializerOptions} from '../types';
import type {SourceMapGeneratorOptions} from './sourceMapGenerator';
import type {GetTransformOptions} from 'metro-config';

type Options = Readonly<
  Omit<
    SerializerOptions,
    | keyof SourceMapGeneratorOptions
    | keyof {
        getTransformOptions: null | undefined | GetTransformOptions;
        platform: null | undefined | string;
      }
  > &
    Omit<
      SourceMapGeneratorOptions,
      keyof {
        getTransformOptions: null | undefined | GetTransformOptions;
        platform: null | undefined | string;
      }
    > & {
      getTransformOptions: null | undefined | GetTransformOptions;
      platform: null | undefined | string;
    }
>;
export type RamBundleInfo = {
  getDependencies: ($$PARAM_0$$: string) => Set<string>;
  startupModules: ReadonlyArray<ModuleTransportLike>;
  lazyModules: ReadonlyArray<ModuleTransportLike>;
  groups: Map<number, Set<number>>;
};
declare function getRamBundleInfo(
  entryPoint: string,
  pre: ReadonlyArray<Module>,
  graph: ReadOnlyGraph,
  options: Options,
): Promise<RamBundleInfo>;
export default getRamBundleInfo;
