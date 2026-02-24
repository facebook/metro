/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<b5035a5d26a55e608aca030ee9ee6afa>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/cli-utils.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

export declare const watchFile: (
  filename: string,
  callback: () => unknown,
) => Promise<void>;
export declare type watchFile = typeof watchFile;
export declare const makeAsyncCommand: <T>(
  command: (argv: T) => Promise<void>,
) => (argv: T) => void;
export declare type makeAsyncCommand = typeof makeAsyncCommand;
