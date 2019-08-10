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

const Module = require('../Module');
const ModuleCache = require('../ModuleCache');

describe('Module', () => {
  let moduleCache;
  let module;

  beforeEach(() => {
    moduleCache = new ModuleCache({});

    module = new Module('/root/to/file.js', moduleCache);
  });

  it('Returns the correct values for many properties and methods', () => {
    expect(module.path).toBe('/root/to/file.js');
  });
});
