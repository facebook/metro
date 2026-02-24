/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<1d044a890d1eebbef947f78609d7c58f>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/DeltaBundler/Serializers/getAllFiles.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {Module, ReadOnlyGraph} from '../types';

type Options = {
  platform: null | undefined | string;
  readonly processModuleFilter: (module: Module) => boolean;
};
declare function getAllFiles(
  pre: ReadonlyArray<Module>,
  graph: ReadOnlyGraph,
  options: Options,
): Promise<ReadonlyArray<string>>;
export default getAllFiles;
