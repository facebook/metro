/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import AmbiguousModuleResolutionError from './errors/AmbiguousModuleResolutionError';
import PackageResolutionError from './errors/PackageResolutionError';
import * as Logger from './Logger';
import Terminal from './Terminal';

export {
  AmbiguousModuleResolutionError,
  Logger,
  PackageResolutionError,
  Terminal,
};
/**
 * Backwards-compatibility with CommonJS consumers using interopRequireDefault.
 * Do not add to this list.
 *
 * @deprecated Default import from 'metro-core' is deprecated, use named exports.
 */
declare const $$EXPORT_DEFAULT_DECLARATION$$: {
  AmbiguousModuleResolutionError: typeof AmbiguousModuleResolutionError;
  Logger: typeof Logger;
  PackageResolutionError: typeof PackageResolutionError;
  Terminal: typeof Terminal;
};
declare type $$EXPORT_DEFAULT_DECLARATION$$ =
  typeof $$EXPORT_DEFAULT_DECLARATION$$;
export default $$EXPORT_DEFAULT_DECLARATION$$;
