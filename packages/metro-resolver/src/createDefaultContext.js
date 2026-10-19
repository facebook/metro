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
import type {TransformResultDependency} from 'metro/private/DeltaBundler/types';

import {redirectModulePath} from './PackageResolve';
import path from 'node:path';

type PartialContext = Readonly<{
  ...ResolutionContext,
  redirectModulePath?: ResolutionContext['redirectModulePath'],
  fileSystemOpenDir?: ResolutionContext['fileSystemOpenDir'],
}>;

/**
 * Helper used by the `metro` package to create the `ResolutionContext` object.
 * As context values can be overridden by callers, this occurs externally to
 * `resolve.js`.
 */
export default function createDefaultContext(
  context: PartialContext,
  dependency: TransformResultDependency,
): ResolutionContext {
  return {
    redirectModulePath: (modulePath: string) =>
      redirectModulePath(context, modulePath),
    dependency,
    ...context,
    // NOTE: `fileSystemOpenDir` is currently not required for backwards-compatibility, but
    // can be cleanly implemented with a fallback performing individual fileSystemLookup calls again
    fileSystemOpenDir:
      context.fileSystemOpenDir ??
      (directory => {
        const result = context.fileSystemLookup(directory);
        if (!result.exists || result.type !== 'd') {
          return null;
        }
        const {realPath} = result;
        return {
          realPath,
          lookup: basename =>
            context.fileSystemLookup(path.join(realPath, basename)),
        };
      }),
  };
}
