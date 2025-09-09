/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {ResolutionContext} from './types';
import type {TransformResultDependency} from 'metro/private/DeltaBundler/types';

type PartialContext = Readonly<
  Omit<
    ResolutionContext,
    keyof {redirectModulePath?: ResolutionContext['redirectModulePath']}
  > & {redirectModulePath?: ResolutionContext['redirectModulePath']}
>;
/**
 * Helper used by the `metro` package to create the `ResolutionContext` object.
 * As context values can be overridden by callers, this occurs externally to
 * `resolve.js`.
 */
declare function createDefaultContext(
  context: PartialContext,
  dependency: TransformResultDependency,
): ResolutionContext;
export default createDefaultContext;
