/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
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
