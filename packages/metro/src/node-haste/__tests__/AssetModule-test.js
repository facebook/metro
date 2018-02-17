/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+js_foundation
 */

'use strict';

jest.mock('fs').mock('../../lib/TransformCaching');

const AssetModule = require('../AssetModule');
const DependencyGraphHelpers = require('../DependencyGraph/DependencyGraphHelpers');
const ModuleCache = require('../ModuleCache');
const TransformCaching = require('../../lib/TransformCaching');
const fs = require('fs');

describe('AssetModule:', () => {
  const defaults = {file: '/arbitrary.png'};

  beforeEach(() => {
    fs.__setMockFilesystem({root: {'image.png': 'png data'}});
  });

  it('is an asset', () => {
    expect(new AssetModule(defaults).isAsset()).toBe(true);
  });

  it('returns an empty source code for an asset', async () => {
    const module = new AssetModule({
      depGraphHelpers: new DependencyGraphHelpers({
        providesModuleNodeModules: [],
        assetExts: ['png'],
      }),
      file: '/root/image.png',
      getTransformCacheKey: () => 'foo',
      localPath: 'image.png',
      moduleCache: new ModuleCache({}),
      options: {transformCache: TransformCaching.mocked()},
      transformCode: () => {
        return Promise.resolve({code: 'module.exports = "asset";'});
      },
    });

    const data = await module.read();

    expect(data.code).toBe('module.exports = "asset";');
    expect(data.source).toBe('');
  });
});
