/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @nolint
 */

/* eslint-disable */

// These annotations are copy/pasted from the built-in Flow definitions and
// tweaked so that then() and catch() accept `null` arguments, that they
// rightfully do. This should probably be changed in the core lib eventually.
declare class Promise<+R> {
  constructor(callback: (
    resolve: (result?: Promise<R> | R) => void,
    reject: (error?: any) => void
  ) => mixed): void;

  then<U>(
    onFulfill?: ?(value: R) => Promise<U> | ?U,
    onReject?: ?(error: any) => Promise<U> | ?U
  ): Promise<U>;

  catch<U>(
    onReject?: (error: any) => ?Promise<U> | U
  ): Promise<U>;

  static resolve<T>(object?: Promise<T> | T): Promise<T>;
  static reject<T>(error?: mixed): Promise<T>;

  static all<T: Iterable<mixed>>(promises: T): Promise<$TupleMap<T, typeof $await>>;
  static race<T>(promises: Array<Promise<T>>): Promise<T>;
}
