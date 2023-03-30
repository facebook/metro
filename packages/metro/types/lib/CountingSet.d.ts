/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

export interface ReadOnlyCountingSet<T> extends Iterable<T> {
  has(item: T): boolean;
  [Symbol.iterator](): Iterator<T>;
  readonly size: number;
  count(item: T): number;
  forEach<ThisT>(
    callbackFn: (
      this: ThisT,
      value: T,
      key: T,
      set: ReadOnlyCountingSet<T>,
    ) => unknown,
    thisArg: ThisT,
  ): void;
}

export default class CountingSet<T> implements ReadOnlyCountingSet<T> {
  constructor(items?: Iterable<T>);
  get size(): number;
  has(item: T): boolean;
  add(item: T): void;
  delete(item: T): void;
  keys(): Iterator<T>;
  values(): Iterator<T>;
  [Symbol.iterator](): Iterator<T>;
  count(item: T): number;
  clear(): void;
  forEach<ThisT>(
    callbackFn: (
      this: ThisT,
      value: T,
      key: T,
      set: ReadOnlyCountingSet<T>,
    ) => unknown,
    thisArg: ThisT,
  ): void;
  toJSON(): unknown;
}
