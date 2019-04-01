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

const babelGenerate = require('@babel/generator').default;
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
        1: {
          handle: 'GCRaTwHwaI1plCgBAAAAAAC5oAcJbnsvAAAZ',
          hash: 'baa06e3fa558fe7f246b3f3e5ee33bc86357c879',
        },
        1.5: {
          handle: 'GAdeUAEMbQH8hyQGAAAAAAC9H193bnsvAAAZ',
          hash: '7e5c0190b0fab299dab0351a5079368a91a372fe',
        },
        2: {
          handle: 'GMsbUgHQlgBGbPsCAAAAAAABXchsbnsvAAAZ',
          hash: '328184a20a8a938b378153280bc636182b9136ac',
        },
        3: {
          handle: 'GMEgUgG9llQL8EUBAAAAAAB2uXdrbnsvAAAZ',
          hash: '4b41f231da982f153257e8384663fae20c7c607d',
        },
        4: {
          handle: 'GFleUAEiuVDxD5wGAAAAAAZWLd1dbnsvAAAZ',
          hash: 'd022de9b8d34bb1b621ef357f1da7573d5a4205d',
        },
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
