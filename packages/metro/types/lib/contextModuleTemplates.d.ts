/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<bcc2ba36a2edccb791b6d380f2c27ebe>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/lib/contextModuleTemplates.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {ContextMode} from '../ModuleGraph/worker/collectDependencies';
/**
 * Generate a context module as a virtual file string.
 *
 * @prop {ContextMode} mode indicates how the modules should be loaded.
 * @prop {string} modulePath virtual file path for the virtual module. Example: `require.context('./src')` -> `'/path/to/project/src'`.
 * @prop {string[]} files list of absolute file paths that must be exported from the context module. Example: `['/path/to/project/src/index.js']`.
 *
 * @returns a string representing a context module (virtual file contents).
 */
export declare function getContextModuleTemplate(
  mode: ContextMode,
  modulePath: string,
  files: string[],
): string;
