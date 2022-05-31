/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+js_foundation
 * @flow strict-local
 */

'use strict';

const debounceAsyncQueue = require('../debounceAsyncQueue');

describe('debounceAsyncQueue', () => {
  it('debounces calls', async () => {
    const fn = jest.fn();
    const debounced = debounceAsyncQueue(fn, 50);
    debounced();
    debounced();
    debounced();
    expect(fn).toHaveBeenCalledTimes(0);
    jest.runAllTimers();
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns a Promise to the eventual return value', async () => {
    const fn = jest.fn(() => Promise.resolve('foo'));
    const debounced = debounceAsyncQueue(fn, 50);
    const pro1 = debounced();
    const pro2 = debounced();
    const pro3 = debounced();
    jest.runAllTimers();
    await Promise.resolve();
    expect(await pro1).toBe('foo');
    expect(await pro2).toBe('foo');
    expect(await pro3).toBe('foo');
  });

  it('queues calls that happen while the previous call is still executing', async () => {
    let finishExecuting:
      | ((result?: Promise<string>) => void)
      | ((result: string) => void) = (result: string) => {};
    const fn = jest.fn(
      () =>
        new Promise((resolve: (result?: Promise<string>) => void) => {
          finishExecuting = resolve;
        }),
    );
    const debounced = debounceAsyncQueue(fn, 50);
    const pro1 = debounced();
    jest.runAllTimers();
    await Promise.resolve();
    const pro2 = debounced();
    const pro3 = debounced();
    // $FlowFixMe[incompatible-call]
    finishExecuting('foo');
    jest.runAllTimers();
    await Promise.resolve();
    // $FlowFixMe[incompatible-call]
    finishExecuting('bar');
    expect(await pro1).toBe('foo');
    expect(await pro2).toBe('bar');
    expect(await pro3).toBe('bar');
  });
});
