/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {Scope} from '@babel/traverse';
import type * as $$IMPORT_TYPEOF_1$$ from '@babel/types';
import type {CallExpression, MemberExpression} from '@babel/types';

type Types = typeof $$IMPORT_TYPEOF_1$$;
type PlatformChecks = {
  isPlatformNode: (
    node: MemberExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ) => boolean;
  isPlatformSelectNode: (
    node: CallExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ) => boolean;
};
declare function createInlinePlatformChecks(
  t: Types,
  requireName?: string,
): PlatformChecks;
export default createInlinePlatformChecks;
