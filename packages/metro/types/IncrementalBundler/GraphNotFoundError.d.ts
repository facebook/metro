/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<850ba6867e140fb0973cd13d0fd1bc60>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/IncrementalBundler/GraphNotFoundError.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {GraphId} from '../lib/getGraphId';

declare class GraphNotFoundError extends Error {
  graphId: GraphId;
  constructor(graphId: GraphId);
}
export default GraphNotFoundError;
