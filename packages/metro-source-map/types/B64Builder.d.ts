/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

/**
 * Efficient builder for base64 VLQ mappings strings.
 *
 * This class uses a buffer that is preallocated with one megabyte and is
 * reallocated dynamically as needed, doubling its size.
 *
 * Encoding never creates any complex value types (strings, objects), and only
 * writes character values to the buffer.
 *
 * For details about source map terminology and specification, check
 * https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit
 */
declare class B64Builder {
  buffer: Buffer;
  pos: number;
  hasSegment: boolean;
  constructor();
  /**
   * Adds `n` markers for generated lines to the mappings.
   */
  markLines(n: number): this;
  /**
   * Starts a segment at the specified column offset in the current line.
   */
  startSegment(column: number): this;
  /**
   * Appends a single number to the mappings.
   */
  append(value: number): this;
  /**
   * Returns the string representation of the mappings.
   */
  toString(): string;
  _writeByte(byte: number): void;
  _realloc(): void;
}
export default B64Builder;
