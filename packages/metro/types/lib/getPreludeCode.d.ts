/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

declare function getPreludeCode($$PARAM_0$$: {
  readonly extraVars?: {[$$Key$$: string]: unknown};
  readonly isDev: boolean;
  readonly globalPrefix: string;
  readonly requireCycleIgnorePatterns: ReadonlyArray<RegExp>;
  readonly unstable_forceFullRefreshPatterns: ReadonlyArray<RegExp>;
}): string;
export default getPreludeCode;
