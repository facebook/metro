/**
 * Portions Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

/**
 * Encodes a number to base64 VLQ format and appends it to the passed-in buffer
 *
 * DON'T USE COMPOUND OPERATORS (eg `>>>=`) ON `let`-DECLARED VARIABLES!
 * V8 WILL DEOPTIMIZE THIS FUNCTION AND MAP CREATION WILL BE 25% SLOWER!
 *
 * DON'T ADD MORE COMMENTS TO THIS FUNCTION TO KEEP ITS LENGTH SHORT ENOUGH FOR
 * V8 OPTIMIZATION!
 */
declare function encode(
  value: number,
  buffer: Buffer,
  position: number,
): number;
export default encode;
