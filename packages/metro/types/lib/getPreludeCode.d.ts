/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<c57e62398654e4f07fea53d28c279b20>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/lib/getPreludeCode.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

declare function getPreludeCode($$PARAM_0$$: {
  readonly extraVars?: {[$$Key$$: string]: unknown};
  readonly isDev: boolean;
  readonly globalPrefix: string;
  readonly requireCycleIgnorePatterns: ReadonlyArray<RegExp>;
  readonly unstable_forceFullRefreshPatterns: ReadonlyArray<RegExp>;
}): string;
export default getPreludeCode;
