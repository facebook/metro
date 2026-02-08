/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {MixedOutput, Module} from '../../types';
import type {JsOutput} from 'metro-transform-worker';

export type Options = Readonly<{
  createModuleId: ($$PARAM_0$$: string) => number | string;
  dev: boolean;
  includeAsyncPaths: boolean;
  projectRoot: string;
  serverRoot: string;
  sourceUrl: null | undefined | string;
}>;
export declare function wrapModule(module: Module, options: Options): string;
export declare function getModuleParams(
  module: Module,
  options: Options,
): Array<unknown>;
export declare function getJsOutput(
  module: Readonly<{output: ReadonlyArray<MixedOutput>; path?: string}>,
): JsOutput;
export declare function isJsModule(module: Module): boolean;
