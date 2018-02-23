/**
 * Copyright (c) 2018-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

const Cache = require('../Cache');

describe('Cache', () => {
  function createStore(i) {
    return {
      name: 'store' + i,
      get: jest.fn().mockImplementation(() => null),
      set: jest.fn(),
    };
  }

  it('returns null when no result is found', async () => {
    const store1 = createStore();
    const store2 = createStore();
    const cache = new Cache([store1, store2]);

    // Calling a wrapped method.
    const result = await cache.get('arg');

    expect(result).toBe(null);
    expect(store1.get).toHaveBeenCalledTimes(1);
    expect(store2.get).toHaveBeenCalledTimes(1);
  });

  it('sequentially searches up until it finds a valid result', async () => {
    const store1 = createStore(1);
    const store2 = createStore(2);
    const store3 = createStore(3);
    const cache = new Cache([store1, store2, store3]);

    // Only cache 2 can return results.
    store2.get.mockImplementation(() => 'foo');

    const result = await cache.get('arg');

    expect(result).toBe('foo');
    expect(store1.get).toHaveBeenCalledTimes(1);
    expect(store2.get).toHaveBeenCalledTimes(1);
    expect(store3.get).not.toHaveBeenCalled();
  });

  it('awaits for promises on stores, even if they return undefined', async () => {
    jest.useFakeTimers();

    let resolve;

    const store1 = createStore();
    const store2 = createStore();
    const promise = new Promise((res, rej) => (resolve = res));
    const cache = new Cache([store1, store2]);

    store1.get.mockImplementation(() => promise);
    cache.get('foo');

    // Store 1 returns a promise, so store 2 is not called until it resolves.
    expect(store1.get).toHaveBeenCalledTimes(1);
    expect(store2.get).not.toHaveBeenCalled();

    resolve(undefined);

    await promise;
    jest.runAllTimers();

    expect(store1.get).toHaveBeenCalledTimes(1);
    expect(store2.get).toHaveBeenCalledTimes(1);
  });

  it('throws on a buggy store', async () => {
    jest.useFakeTimers();

    const store1 = createStore();
    const store2 = createStore();
    const cache = new Cache([store1, store2]);

    let err1 = null;
    let err2 = null;

    // Try sets.
    store1.set.mockImplementation(() => Promise.reject(new RangeError('foo')));
    store2.set.mockImplementation(() => null);

    expect(() => cache.set('arg')).not.toThrow(); // Async throw.

    try {
      jest.runAllTimers(); // Advancing the timer will make the cache throw.
    } catch (err) {
      err1 = err;
    }

    expect(err1).toBeInstanceOf(RangeError);

    // Try gets.
    store1.get.mockImplementation(() => Promise.reject(new TypeError('bar')));
    store2.get.mockImplementation(() => null);

    try {
      await cache.get('arg');
    } catch (err) {
      err2 = err;
    }

    expect(err2).toBeInstanceOf(TypeError);
  });
});
