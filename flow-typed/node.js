/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

declare module 'timers' {
  declare export class Timeout {
    close(): this;
    hasRef(): boolean;
    ref(): this;
    refresh(): this;
    unref(): this;
    [key: $SymbolToPrimitive]: () => number;
    // Wait for Node 18.18, and multiple key support
    // [key: $SymbolDispose]: () => void;
  }

  declare export class Immediate {
    hasRef(): boolean;
    ref(): this;
    unref(): this;
    // Wait for Node 18.18
    // [key: $SymbolDispose]: () => void;
  }

  declare export function setTimeout<TArgs = $ReadOnlyArray<mixed>>(
    callback: (...args: TArgs) => mixed,
    delay: ?number /* default: 1 */,
    ...args: TArgs
  ): Timeout;
  declare export function setInterval<TArgs = $ReadOnlyArray<mixed>>(
    callback: (...args: TArgs) => mixed,
    delay: ?number /* default: 1 */,
    ...args: TArgs
  ): Timeout;
  declare export function setImmediate<TArgs = $ReadOnlyArray<mixed>>(
    callback: (...args: TArgs) => mixed,
    ...args: TArgs
  ): Immediate;

  declare export function clearTimeout(timeout: Timeout): void;
  declare export function clearInterval(timeout: Timeout): void;
  declare export function clearImmediate(immediate: Immediate): void;
}

declare module 'timers/promises' {
  type TimerOptions = $ReadOnly<{
    ref?: boolean,
    signal?: AbortSignal,
  }>;

  declare export function setTimeout<T>(
    delay: number,
    value: T,
    options?: TimerOptions,
  ): Promise<T>;
  declare export function setImmediate<T>(
    value: T,
    options?: TimerOptions,
  ): Promise<T>;
  declare export function setInterval<T>(
    delay: number,
    value: T,
    options?: TimerOptions,
  ): Promise<T>;

  declare export const scheduler: {
    wait(delay: number, options: TimerOptions): Promise<void>,
    yield(): Promise<void>,
  };
}
