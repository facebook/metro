/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

export * from './types';

import {ResolutionContext, Resolution} from './types';

export function resolve(
  context: ResolutionContext,
  moduleName: string,
  platform: string | null,
): Resolution;
