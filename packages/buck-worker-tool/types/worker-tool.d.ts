/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<1155614c83550da2ee3328fd45cb59b5>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/buck-worker-tool/src/worker-tool.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {Duplex} from 'stream';

import {Console} from 'console';

export type Command = (
  argv: Array<string>,
  structuredArgs: unknown,
  console: Console,
) => Promise<void> | void;
export type Commands = {[key: string]: Command};
declare function buckWorker(commands: Commands): Duplex;
export {buckWorker};
