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
/**
 * A Set that only deletes a given item when the number of delete(item) calls
 * matches the number of add(item) calls. Iteration and `size` are in terms of
 * *unique* items.
 */
declare class CountingSet<T> implements ReadOnlyCountingSet<T> {
  constructor(items?: Iterable<T>);
  has(item: T): boolean;
  add(item: T): void;
  delete(item: T): void;
  keys(): Iterator<T>;
  values(): Iterator<T>;
  entries(): Iterator<[T, T]>;
  [Symbol.iterator](): Iterator<T>;
  get size(): number;
  count(item: T): number;
  clear(): void;
  forEach<ThisT>(
    callbackFn: (this: ThisT, value: T, key: T, set: CountingSet<T>) => unknown,
    thisArg: ThisT,
  ): void;
  toJSON(): unknown;
}
export default CountingSet;
