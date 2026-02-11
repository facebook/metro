/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
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
