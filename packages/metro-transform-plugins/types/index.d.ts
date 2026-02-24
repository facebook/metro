/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<4831d14939e3956402eac933b0d81f6c>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-transform-plugins/src/index.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type constantFoldingPlugin from './constant-folding-plugin';
import type importExportPlugin from './import-export-plugin';
import type inlinePlugin from './inline-plugin';
import type inlineRequiresPlugin from './inline-requires-plugin';
import type normalizePseudoGlobals from './normalizePseudoGlobals';

interface TransformPlugins {
  addParamsToDefineCall(code: string, ...params: unknown[]): string;
  constantFoldingPlugin: typeof constantFoldingPlugin;
  importExportPlugin: typeof importExportPlugin;
  inlinePlugin: typeof inlinePlugin;
  inlineRequiresPlugin: typeof inlineRequiresPlugin;
  normalizePseudoGlobals: typeof normalizePseudoGlobals;
  getTransformPluginCacheKeyFiles(): ReadonlyArray<string>;
}

declare const transformPlugins: TransformPlugins;
export = transformPlugins;
