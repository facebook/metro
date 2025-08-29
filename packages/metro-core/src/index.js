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
export default {
  AmbiguousModuleResolutionError,
  Logger,
  PackageResolutionError,
  Terminal,
};
