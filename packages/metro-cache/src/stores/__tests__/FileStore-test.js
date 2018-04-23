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

describe('FileStore', () => {
  let FileStore;
  let fs;

  beforeEach(() => {
    jest
      .resetModules()
      .resetAllMocks()
      .useFakeTimers()
      .mock('fs', () => new (require('metro-memory-fs'))());

    FileStore = require('../FileStore');
    fs = require('fs');
    jest.spyOn(fs, 'unlinkSync');
  });

  it('sets and writes into the cache', () => {
    const fileStore = new FileStore({root: '/root'});
    const cache = new Buffer([0xfa, 0xce, 0xb0, 0x0c]);

    fileStore.set(cache, {foo: 42});
    expect(fileStore.get(cache)).toEqual({foo: 42});
  });

  it('returns null when reading a non-existing file', () => {
    const fileStore = new FileStore({root: '/root'});
    const cache = new Buffer([0xfa, 0xce, 0xb0, 0x0c]);

    expect(fileStore.get(cache)).toEqual(null);
  });
});
