/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<e60b75113fdb3dbe291de1bc9b2656e2>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-config/src/index.flow.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

export type * from './types';
import getDefaultConfig from './defaults';
import {loadConfig, mergeConfig, resolveConfig} from './loadConfig';

export {getDefaultConfig, loadConfig, mergeConfig, resolveConfig};
/**
 * Backwards-compatibility with CommonJS consumers using interopRequireDefault.
 * Do not add to this list.
 *
 * @deprecated Default import from 'metro-config' is deprecated, use named exports.
 */
declare const $$EXPORT_DEFAULT_DECLARATION$$: {
  getDefaultConfig: typeof getDefaultConfig;
  loadConfig: typeof loadConfig;
  mergeConfig: typeof mergeConfig;
  resolveConfig: typeof resolveConfig;
};
declare type $$EXPORT_DEFAULT_DECLARATION$$ =
  typeof $$EXPORT_DEFAULT_DECLARATION$$;
export default $$EXPORT_DEFAULT_DECLARATION$$;
