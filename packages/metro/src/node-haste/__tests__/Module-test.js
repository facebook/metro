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

const Module = require('../Module');
const ModuleCache = require('../ModuleCache');

describe('Module', () => {
  let moduleCache;
  let module;

  beforeEach(() => {
    moduleCache = new ModuleCache({});

    module = new Module({
      file: '/root/to/file.js',
      localPath: 'file.js',
      moduleCache,
    });
  });

  it('Returns the correct values for many properties and methods', () => {
    expect(module.localPath).toBe('file.js');
    expect(module.path).toBe('/root/to/file.js');

    expect(module.isAsset()).toBe(false);
    expect(module.isPolyfill()).toBe(false);
  });
});
