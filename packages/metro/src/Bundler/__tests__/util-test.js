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

const {babelGenerate} = require('../../babel-bridge');
const {
  generateAssetCodeFileAst,
  generateRemoteAssetCodeFileAst,
} = require('../util');

describe('Util', () => {
  const assetDescriptor = {
    __packager_asset: true,
    fileSystemLocation: '/foo/bar',
    hash: '9ec9c5721fcd5cc401b4499a0cc8878bc1a18bb5',
    height: 24,
    name: 'my-asset',
    scales: [1, 1.5, 2, 3, 4],
    type: 'png',
    width: 240,
  };

  const remoteFileMap = {
    '/foo/bar': {
      'my-asset': {
        1: 'GCRaTwHwaI1plCgBAAAAAAC5oAcJbnsvAAAZ',
        1.5: 'GAdeUAEMbQH8hyQGAAAAAAC9H193bnsvAAAZ',
        2: 'GMsbUgHQlgBGbPsCAAAAAAABXchsbnsvAAAZ',
        3: 'GMEgUgG9llQL8EUBAAAAAAB2uXdrbnsvAAAZ',
        4: 'GFleUAEiuVDxD5wGAAAAAAZWLd1dbnsvAAAZ',
      },
    },
  };

  it('generates a local asset for a given descriptor', () => {
    const {code} = babelGenerate(
      generateAssetCodeFileAst(
        'react-native-module/asset-resolver',
        assetDescriptor,
      ),
    );

    expect(code).toMatchSnapshot();
  });

  it('generates a remote asset for a given descriptor', () => {
    const {code} = babelGenerate(
      generateRemoteAssetCodeFileAst(
        'react-native-module/asset-resolver',
        assetDescriptor,
        'https://example.com',
        remoteFileMap,
      ),
    );

    expect(code).toMatchSnapshot();
  });

  it('returns null if the asset is not present on the map', () => {
    const asset = generateRemoteAssetCodeFileAst(
      'react-native-module/asset-resolver',
      assetDescriptor,
      'https://example.com',
      {},
    );

    expect(asset).toBe(null);
  });
});
