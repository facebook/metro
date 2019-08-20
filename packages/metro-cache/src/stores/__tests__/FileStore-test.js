/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
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
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);

    fileStore.set(cache, {foo: 42});
    expect(fileStore.get(cache)).toEqual({foo: 42});
  });

  it('returns null when reading a non-existing file', () => {
    const fileStore = new FileStore({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);

    expect(fileStore.get(cache)).toEqual(null);
  });

  it('returns null when reading a empty file', () => {
    const fileStore = new FileStore({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);
    const filePath = fileStore._getFilePath(cache);

    fs.writeFileSync(filePath, '');
    expect(fileStore.get(cache)).toEqual(null);
  });

  it('writes into cache if folder is missing', () => {
    const fileStore = new FileStore({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);
    const data = Buffer.from([0xca, 0xc4, 0xe5]);

    require('rimraf').sync('/root');
    fileStore.set(cache, data);
    expect(fileStore.get(cache)).toEqual(data);
  });

  it('reads and writes binary data', () => {
    const fileStore = new FileStore({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);
    const data = Buffer.from([0xca, 0xc4, 0xe5]);

    fileStore.set(cache, data);
    expect(fileStore.get(cache)).toEqual(data);
  });
});
