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

describe('PersistedMapStore', () => {
  const key1 = Buffer.from('foo');
  const key2 = Buffer.from('bar');
  let now;
  let serializer;
  let fs;
  let PersistedMapStore;

  function advance(time) {
    now += time;
    jest.advanceTimersByTime(time);
  }

  Date.now = () => now;

  beforeEach(() => {
    jest
      .resetModules()
      .resetAllMocks()
      .useFakeTimers();

    jest.mock('fs', () => ({
      existsSync: jest.fn(),
    }));

    jest.mock('jest-serializer', () => ({
      readFileSync: jest.fn(),
      writeFileSync: jest.fn(),
    }));

    fs = require('fs');
    serializer = require('jest-serializer');
    PersistedMapStore = require('../PersistedMapStore');

    now = 0;
  });

  it('ensures that the persisted map file is checked first', () => {
    const store = new PersistedMapStore({path: '/foo'});

    fs.existsSync.mockReturnValue(false);
    store.get(key1);

    expect(fs.existsSync).toHaveBeenCalledTimes(1);
    expect(serializer.readFileSync).not.toBeCalled();
  });

  it('loads the file when it exists', () => {
    const store = new PersistedMapStore({path: '/foo'});

    fs.existsSync.mockReturnValue(true);
    serializer.readFileSync.mockReturnValue(new Map());
    store.get(key1);

    expect(fs.existsSync).toHaveBeenCalledTimes(1);
    expect(serializer.readFileSync).toHaveBeenCalledTimes(1);
    expect(serializer.readFileSync.mock.calls[0]).toEqual(['/foo']);
  });

  it('throws if the file is invalid', () => {
    const store = new PersistedMapStore({path: '/foo'});

    fs.existsSync.mockReturnValue(true);
    serializer.readFileSync.mockImplementation(() => {
      throw new Error();
    });
    expect(() => store.get(key1)).toThrow();
  });

  it('deserializes and serializes correctly from/to disk', () => {
    let file;

    fs.existsSync.mockReturnValue(false);
    serializer.readFileSync.mockImplementation(() => file);
    serializer.writeFileSync.mockImplementation((_, data) => (file = data));

    const store1 = new PersistedMapStore({path: '/foo'});

    store1.set(key1, 'value1');
    store1.set(key2, 123456);

    // Force throttle to kick in and perform the file storage.
    advance(7500);
    fs.existsSync.mockReturnValue(true);

    const store2 = new PersistedMapStore({path: '/foo'});

    expect(store2.get(key1)).toBe('value1');
    expect(store2.get(key2)).toBe(123456);
  });

  it('ensures that the throttling is working correctly', () => {
    const store1 = new PersistedMapStore({
      path: '/foo',
      writeDelay: 1234,
    });

    // Triggers the write, multiple times (only one write should happen).
    store1.set(key1, 'foo');
    store1.set(key1, 'bar');
    store1.set(key1, 'baz');

    advance(1233);
    expect(serializer.writeFileSync).toHaveBeenCalledTimes(0);

    advance(1);
    expect(serializer.writeFileSync).toHaveBeenCalledTimes(1);
  });
});
