/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<d8ccae61344526a4f6da61987b3dad9b>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/DeltaBundler/Serializers/hmrJSBundle.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {DeltaResult, ReadOnlyGraph} from '../types';
import type {HmrModule} from 'metro-runtime/src/modules/types';

type Options = Readonly<{
  clientUrl: URL;
  createModuleId: ($$PARAM_0$$: string) => number;
  includeAsyncPaths: boolean;
  projectRoot: string;
  serverRoot: string;
}>;
declare function hmrJSBundle(
  delta: DeltaResult,
  graph: ReadOnlyGraph,
  options: Options,
): {
  readonly added: ReadonlyArray<HmrModule>;
  readonly deleted: ReadonlyArray<number>;
  readonly modified: ReadonlyArray<HmrModule>;
};
export default hmrJSBundle;
