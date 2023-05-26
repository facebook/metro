/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 */

// An incomplete definition for Node's builtin `perf_hooks` module.

declare module 'perf_hooks' {
  declare export var performance: {
    clearMarks(name?: string): void,
    mark(name?: string): void,
    measure(name: string, startMark?: string, endMark?: string): void,
    nodeTiming: mixed /* FIXME */,
    now(): number,
    timeOrigin: number,
    timerify<TArgs: Iterable<mixed>, TReturn>(
      f: (...TArgs) => TReturn,
    ): (...TArgs) => TReturn,
  };
}
