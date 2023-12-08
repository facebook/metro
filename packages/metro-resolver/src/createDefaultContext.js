/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import type {ResolutionContext} from './types';
import type {TransformResultDependency} from 'metro/src/DeltaBundler/types.flow';

import {redirectModulePath} from './PackageResolve';

type PartialContext = $ReadOnly<{
  ...ResolutionContext,
  redirectModulePath?: ResolutionContext['redirectModulePath'],
}>;

/**
 * Helper used by the `metro` package to create the `ResolutionContext` object.
 * As context values can be overridden by callers, this occurs externally to
 * `resolve.js`.
 */
function createDefaultContext(
  context: PartialContext,
  dependency: TransformResultDependency,
): ResolutionContext {
  return {
    redirectModulePath: (modulePath: string) =>
      redirectModulePath(context, modulePath),
    dependency,
    ...context,
  };
}

module.exports = createDefaultContext;
