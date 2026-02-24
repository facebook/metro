/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<80e0670a74f3bf0ae7524193ec36bff9>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-core/src/index.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
