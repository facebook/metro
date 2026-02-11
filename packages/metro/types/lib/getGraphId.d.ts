/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {TransformInputOptions} from '../DeltaBundler/types';
import type {ResolverInputOptions} from '../shared/types';

export declare type GraphId = string;
declare function getGraphId(
  entryFile: string,
  options: TransformInputOptions,
  $$PARAM_2$$: Readonly<{
    shallow: boolean;
    lazy: boolean;
    unstable_allowRequireContext: boolean;
    resolverOptions: ResolverInputOptions;
  }>,
): GraphId;
export default getGraphId;
