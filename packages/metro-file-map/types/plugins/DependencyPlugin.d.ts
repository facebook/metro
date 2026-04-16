/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<344b340710d6da24bcb609058e7ce8d6>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/plugins/DependencyPlugin.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {Path} from '../flow-types';

import FileDataPlugin from './FileDataPlugin';

export type DependencyPluginOptions = Readonly<{
  /** Path to custom dependency extractor module */
  dependencyExtractor: null | undefined | string;
  /** Whether to compute dependencies (performance optimization) */
  computeDependencies: boolean;
}>;
declare class DependencyPlugin extends FileDataPlugin<ReadonlyArray<string> | null> {
  constructor(options: DependencyPluginOptions);
  getDependencies(mixedPath: Path): null | undefined | ReadonlyArray<string>;
}
export default DependencyPlugin;
