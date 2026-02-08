/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 *
 */

/**
 * Implementation of a RAM bundle parser in JS.
 *
 * It receives a Buffer as an input and implements two main methods, which are
 * able to run in constant time no matter the size of the bundle:
 *
 * getStartupCode(): returns the runtime and the startup code of the bundle.
 * getModule(): returns the code for the specified module.
 */
declare class RamBundleParser {
  _buffer: Buffer;
  _numModules: number;
  _startupCodeLength: number;
  _startOffset: number;
  constructor(buffer: Buffer);
  _readPosition(pos: number): number;
  getStartupCode(): string;
  getModule(id: number): string;
}
export default RamBundleParser;
