/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

export interface ReadOnlyCountingSet<T> extends Iterable<T> {
  has(item: T): boolean;
  @@iterator(): Iterator<T>;
  +size: number;
  count(item: T): number;
  forEach<ThisT>(
    callbackFn: (
      this: ThisT,
      value: T,
      key: T,
      set: ReadOnlyCountingSet<T>,
    ) => mixed,

    // NOTE: Should be optional, but Flow seems happy to infer undefined here
    // which is what we want.
    thisArg: ThisT,
  ): void;
}

/**
 * A Set that only deletes a given item when the number of delete(item) calls
 * matches the number of add(item) calls. Iteration and `size` are in terms of
 * *unique* items.
 */
export default class CountingSet<T> implements ReadOnlyCountingSet<T> {
  #map: Map<T, number> = new Map();

  constructor(items?: Iterable<T>) {
    if (items) {
      if (items instanceof CountingSet) {
        this.#map = new Map(items.#map);
      } else {
        for (const item of items) {
          this.add(item);
        }
      }
    }
  }

  has(item: T): boolean {
    return this.#map.has(item);
  }

  add(item: T): void {
    const newCount = this.count(item) + 1;
    this.#map.set(item, newCount);
  }

  delete(item: T): void {
    const newCount = this.count(item) - 1;
    if (newCount <= 0) {
      this.#map.delete(item);
    } else {
      this.#map.set(item, newCount);
    }
  }

  keys(): Iterator<T> {
    return this.#map.keys();
  }

  values(): Iterator<T> {
    return this.#map.keys();
  }

  *entries(): Iterator<[T, T]> {
    for (const item of this) {
      yield [item, item];
    }
  }

  // Iterate over unique entries
  // $FlowIssue[unsupported-syntax]
  // $FlowFixMe[missing-local-annot]
  [Symbol.iterator](): Iterator<T> {
    return this.values();
  }

  /*::
  // For Flow's benefit
  @@iterator(): Iterator<T> {
    return this.values();
  }
  */

  // Number of unique entries
  // $FlowIssue[unsafe-getters-setters]
  get size(): number {
    return this.#map.size;
  }

  count(item: T): number {
    return this.#map.get(item) ?? 0;
  }

  clear(): void {
    this.#map.clear();
  }

  forEach<ThisT>(
    callbackFn: (this: ThisT, value: T, key: T, set: CountingSet<T>) => mixed,
    thisArg: ThisT,
  ): void {
    for (const item of this) {
      callbackFn.call(thisArg, item, item, this);
    }
  }

  // For Jest purposes. Ideally a custom serializer would be enough, but in
  // practice there is hardcoded magic for Set in toEqual (etc) that we cannot
  // extend to custom collection classes. Instead let's assume values are
  // sortable ( = strings) and make this look like an array with some stable
  // order.
  toJSON(): mixed {
    return [...this].sort();
  }
}
