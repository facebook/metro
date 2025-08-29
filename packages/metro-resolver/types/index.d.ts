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

import {Resolution, ResolutionContext} from './types';

export function resolve(
  context: ResolutionContext,
  moduleName: string,
  platform: string | null,
): Resolution;

/**
 * Backwards-compatibility with CommonJS consumers using interopRequireDefault.
 * Do not add to this list.
 *
 * @deprecated Default import from 'metro-resolver' is deprecated, use named exports.
 */
declare const $$EXPORT_DEFAULT_DECLARATION$$: {
  resolve: typeof resolve;
};
declare type $$EXPORT_DEFAULT_DECLARATION$$ =
  typeof $$EXPORT_DEFAULT_DECLARATION$$;
export default $$EXPORT_DEFAULT_DECLARATION$$;
