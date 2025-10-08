/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {Resolution, ResolutionContext} from './types';

export type FutureModule = Readonly<{fullPath: string}>;
export type FutureModulesMap = Map<string, FutureModule>;
declare function resolve(
  context: ResolutionContext,
  moduleName: string,
  platform: string | null,
  futureModules?: null | undefined | FutureModulesMap,
): Resolution;
export default resolve;
