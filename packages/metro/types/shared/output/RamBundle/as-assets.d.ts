/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<02d7f6eec9c93d02612c9b2fdef18cef>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/shared/output/RamBundle/as-assets.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {RamBundleInfo} from '../../../DeltaBundler/Serializers/getRamBundleInfo';
import type {OutputOptions} from '../../types';
/**
 * Saves all JS modules of an app as single files
 * The startup code (prelude, polyfills etc.) are written to the file
 * designated by the `bundleOuput` option.
 * All other modules go into a 'js-modules' folder that in the same parent
 * directory as the startup file.
 */
declare function saveAsAssets(
  bundle: RamBundleInfo,
  options: OutputOptions,
  log: (...args: Array<string>) => void,
): Promise<unknown>;
export default saveAsAssets;
