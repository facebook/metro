/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

jest.mock('fs').mock('../ModuleCache');

const fs = require('fs');
const ModuleCache = require('../ModuleCache');
const Module = require('../Module');

describe('Module', () => {
  let transformCode;
  let moduleCache;
  let module;

  beforeEach(() => {
    transformCode = jest.fn().mockReturnValue({
      code: 'int main(void) { return -1; }',
      dependencies: ['stdlib.h', 'conio.h'],
      map: [],
    });

    moduleCache = new ModuleCache();

    module = new Module({
      file: '/root/to/file.js',
      localPath: 'file.js',
      moduleCache,
      transformCode,
    });
  });

  afterEach(() => {
    fs.readFileSync.mockReset();
  });

  it('Returns the correct values for many properties and methods', () => {
    expect(module.localPath).toBe('file.js');
    expect(module.path).toBe('/root/to/file.js');

    expect(module.isAsset()).toBe(false);
    expect(module.isPolyfill()).toBe(false);
  });

  it('returns the result from the transform code straight away', async () => {
    fs.readFileSync.mockReturnValue('original code');

    expect(await module.read({})).toEqual({
      code: 'int main(void) { return -1; }',
      dependencies: ['stdlib.h', 'conio.h'],
      map: [],
      source: 'original code',
    });
  });

  it('checks that code is only read once until invalidated', async () => {
    fs.readFileSync.mockReturnValue('original code');

    // Read once. No access to "source", so no reads.
    await module.read({});
    expect(fs.readFileSync).toHaveBeenCalledTimes(0);

    // Read again, accessing "source".
    expect((await module.read({})).source).toEqual('original code');
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);

    // Read again, accessing "source" again. Still 1 because code was cached.
    expect((await module.read({})).source).toEqual('original code');
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);

    // Invalidate.
    module.invalidate();

    // Read again, this time it will read it.
    expect((await module.read({})).source).toEqual('original code');
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
  });
});
