/**
 * Copyright (c) 2018-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 * @flow
 */

'use strict';

const Cache = require('../Cache');

describe('Cache', () => {
  function createStore(i) {
    return {
      get: jest.fn().mockImplementation(() => null),
      set: jest.fn(),
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null when no result is found', async () => {
    const store1 = createStore();
    const store2 = createStore();
    const cache = new Cache([store1, store2]);

    // Calling a wrapped method.
    const result = await cache.get(Buffer.from('foo'));

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
    store2.get.mockImplementation(() => 'hit!');

    const result = await cache.get(Buffer.from('foo'));

    expect(result).toBe('hit!');
    expect(store1.get).toHaveBeenCalledTimes(1);
    expect(store2.get).toHaveBeenCalledTimes(1);
    expect(store3.get).not.toHaveBeenCalled();
  });

  it('skips all cache stores when a hit is produced, based on the same key', () => {
    const store1 = createStore();
    const store2 = createStore();
    const store3 = createStore();
    const cache = new Cache([store1, store2, store3]);
    const key = Buffer.from('foo');

    store2.get.mockImplementation(() => 'hit!');

    // Get and set. Set should only affect store 1, not 2 (hit) and 3 (after).
    cache.get(key);
    cache.set(key);

    expect(store1.set).toHaveBeenCalledTimes(1);
    expect(store2.set).not.toHaveBeenCalled();
    expect(store3.set).not.toHaveBeenCalled();
  });

  it('awaits for promises on stores, even if they return undefined', async () => {
    let resolve;

    const store1 = createStore();
    const store2 = createStore();
    const promise = new Promise((res, rej) => (resolve = res));
    const cache = new Cache([store1, store2]);

    store1.get.mockImplementation(() => promise);
    const get = cache.get(Buffer.from('foo'));

    // Store 1 returns a promise, so store 2 is not called until it resolves.
    expect(store1.get).toHaveBeenCalledTimes(1);
    expect(store2.get).not.toHaveBeenCalled();

    if (!resolve) {
      throw new Error('Flow needs this');
    }

    resolve(undefined);
    await Promise.all([promise, get]);

    expect(store1.get).toHaveBeenCalledTimes(1);
    expect(store2.get).toHaveBeenCalledTimes(1);
  });

  it('throws on a buggy store set', async () => {
    jest.useFakeTimers();

    const store1 = createStore();
    const store2 = createStore();
    const cache = new Cache([store1, store2]);
    let error = null;

    store1.set.mockImplementation(() => null);
    store2.set.mockImplementation(() => Promise.reject(new RangeError('foo')));

    try {
      cache.set(Buffer.from('foo'), 'arg');
      jest.runAllTimers();
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(RangeError);
  });

  it('throws on a buggy store get', async () => {
    const store1 = createStore();
    const store2 = createStore();
    const cache = new Cache([store1, store2]);
    let error = null;

    store1.get.mockImplementation(() => null);
    store2.get.mockImplementation(() => Promise.reject(new TypeError('bar')));

    try {
      await cache.get(Buffer.from('foo'));
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(TypeError);
  });
});
