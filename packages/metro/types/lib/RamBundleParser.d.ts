/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @generated SignedSource<<ebddbde1dcdecbbee129fd96caaf3bb0>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/lib/RamBundleParser.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
