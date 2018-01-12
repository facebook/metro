/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

jest.mock('fs');
jest.mock('image-size');

const {getAssetData, getAsset} = require('../');
const crypto = require('crypto');
const fs = require('fs');

const mockImageWidth = 300;
const mockImageHeight = 200;

require('image-size').mockReturnValue({
  width: mockImageWidth,
  height: mockImageHeight,
});

describe('getAsset', () => {
  it('should work for the simple case', () => {
    fs.__setMockFilesystem({
      root: {
        imgs: {
          'b.png': 'b image',
          'b@2x.png': 'b2 image',
        },
      },
    });

    return Promise.all([
      getAsset('imgs/b.png', ['/root']),
      getAsset('imgs/b@1x.png', ['/root']),
    ]).then(resp => resp.forEach(data => expect(data).toBe('b image')));
  });

  it('should work for the simple case with platform ext', async () => {
    fs.__setMockFilesystem({
      root: {
        imgs: {
          'b.ios.png': 'b ios image',
          'b.android.png': 'b android image',
          'c.png': 'c general image',
          'c.android.png': 'c android image',
        },
      },
    });

    expect(
      await Promise.all([
        getAsset('imgs/b.png', ['/root'], 'ios'),
        getAsset('imgs/b.png', ['/root'], 'android'),
        getAsset('imgs/c.png', ['/root'], 'android'),
        getAsset('imgs/c.png', ['/root'], 'ios'),
        getAsset('imgs/c.png', ['/root']),
      ]),
    ).toEqual([
      'b ios image',
      'b android image',
      'c android image',
      'c general image',
      'c general image',
    ]);
  });

  it('should work for the simple case with jpg', () => {
    fs.__setMockFilesystem({
      root: {
        imgs: {
          'b.png': 'png image',
          'b.jpg': 'jpeg image',
        },
      },
    });

    return Promise.all([
      getAsset('imgs/b.jpg', ['/root']),
      getAsset('imgs/b.png', ['/root']),
    ]).then(data => expect(data).toEqual(['jpeg image', 'png image']));
  });

  it('should pick the bigger one', async () => {
    fs.__setMockFilesystem({
      root: {
        imgs: {
          'b@1x.png': 'b1 image',
          'b@2x.png': 'b2 image',
          'b@4x.png': 'b4 image',
          'b@4.5x.png': 'b4.5 image',
        },
      },
    });

    expect(await getAsset('imgs/b@3x.png', ['/root'])).toBe('b4 image');
  });

  it('should pick the bigger one with platform ext', async () => {
    fs.__setMockFilesystem({
      root: {
        imgs: {
          'b@1x.png': 'b1 image',
          'b@2x.png': 'b2 image',
          'b@4x.png': 'b4 image',
          'b@4.5x.png': 'b4.5 image',
          'b@1x.ios.png': 'b1 ios image',
          'b@2x.ios.png': 'b2 ios image',
          'b@4x.ios.png': 'b4 ios image',
          'b@4.5x.ios.png': 'b4.5 ios image',
        },
      },
    });

    expect(
      await Promise.all([
        getAsset('imgs/b@3x.png', ['/root']),
        getAsset('imgs/b@3x.png', ['/root'], 'ios'),
      ]),
    ).toEqual(['b4 image', 'b4 ios image']);
  });

  it('should support multiple project roots', async () => {
    fs.__setMockFilesystem({
      root: {
        imgs: {
          'b.png': 'b image',
        },
      },
      root2: {
        newImages: {
          imgs: {
            'b@1x.png': 'b1 image',
          },
        },
      },
    });

    expect(await getAsset('newImages/imgs/b.png', ['/root', '/root2'])).toBe(
      'b1 image',
    );
  });
});

describe('getAssetData', () => {
  it('should get assetData', () => {
    fs.__setMockFilesystem({
      root: {
        imgs: {
          'b@1x.png': 'b1 image',
          'b@2x.png': 'b2 image',
          'b@4x.png': 'b4 image',
          'b@4.5x.png': 'b4.5 image',
        },
      },
    });

    return getAssetData('/root/imgs/b.png', 'imgs/b.png', []).then(data => {
      expect(data).toEqual(
        expect.objectContaining({
          __packager_asset: true,
          type: 'png',
          name: 'b',
          scales: [1, 2, 4, 4.5],
          fileSystemLocation: '/root/imgs',
          httpServerLocation: '/assets/imgs',
          files: [
            '/root/imgs/b@1x.png',
            '/root/imgs/b@2x.png',
            '/root/imgs/b@4x.png',
            '/root/imgs/b@4.5x.png',
          ],
        }),
      );
    });
  });

  it('should get assetData for non-png images', async () => {
    fs.__setMockFilesystem({
      root: {
        imgs: {
          'b@1x.jpg': 'b1 image',
          'b@2x.jpg': 'b2 image',
          'b@4x.jpg': 'b4 image',
          'b@4.5x.jpg': 'b4.5 image',
        },
      },
    });

    const data = await getAssetData('/root/imgs/b.jpg', 'imgs/b.jpg', []);

    expect(data).toEqual(
      expect.objectContaining({
        __packager_asset: true,
        type: 'jpg',
        name: 'b',
        scales: [1, 2, 4, 4.5],
        fileSystemLocation: '/root/imgs',
        httpServerLocation: '/assets/imgs',
        files: [
          '/root/imgs/b@1x.jpg',
          '/root/imgs/b@2x.jpg',
          '/root/imgs/b@4x.jpg',
          '/root/imgs/b@4.5x.jpg',
        ],
      }),
    );
  });

  it('loads and runs asset plugins', async () => {
    jest.mock(
      'mockPlugin1',
      () => {
        return asset => {
          asset.extraReverseHash = asset.hash
            .split('')
            .reverse()
            .join('');
          return asset;
        };
      },
      {virtual: true},
    );

    jest.mock(
      'asyncMockPlugin2',
      () => {
        return async asset => {
          expect(asset.extraReverseHash).toBeDefined();
          asset.extraPixelCount = asset.width * asset.height;
          return asset;
        };
      },
      {virtual: true},
    );

    fs.__setMockFilesystem({
      root: {
        imgs: {
          'b@1x.png': 'b1 image',
          'b@2x.png': 'b2 image',
          'b@3x.png': 'b3 image',
        },
      },
    });

    const data = await getAssetData('/root/imgs/b.png', 'imgs/b.png', [
      'mockPlugin1',
      'asyncMockPlugin2',
    ]);

    expect(data).toEqual(
      expect.objectContaining({
        __packager_asset: true,
        type: 'png',
        name: 'b',
        scales: [1, 2, 3],
        fileSystemLocation: '/root/imgs',
        httpServerLocation: '/assets/imgs',
        files: [
          '/root/imgs/b@1x.png',
          '/root/imgs/b@2x.png',
          '/root/imgs/b@3x.png',
        ],
        extraPixelCount: mockImageWidth * mockImageHeight,
      }),
    );
    expect(typeof data.extraReverseHash).toBe('string');
  });

  describe('hash:', () => {
    let mockFS;

    beforeEach(() => {
      mockFS = {
        root: {
          imgs: {
            'b@1x.jpg': 'b1 image',
            'b@2x.jpg': 'b2 image',
            'b@4x.jpg': 'b4 image',
            'b@4.5x.jpg': 'b4.5 image',
          },
        },
      };

      fs.__setMockFilesystem(mockFS);
    });

    it('uses the file contents to build the hash', async () => {
      const hash = crypto.createHash('md5');

      for (const name in mockFS.root.imgs) {
        hash.update(mockFS.root.imgs[name]);
      }

      expect(await getAssetData('/root/imgs/b.jpg', 'imgs/b.jpg', [])).toEqual(
        expect.objectContaining({hash: hash.digest('hex')}),
      );
    });

    it('changes the hash when the passed-in file watcher emits an `all` event', async () => {
      const initialData = await getAssetData(
        '/root/imgs/b.jpg',
        'imgs/b.jpg',
        [],
      );

      mockFS.root.imgs['b@4x.jpg'] = 'updated data';

      const data = await getAssetData('/root/imgs/b.jpg', 'imgs/b.jpg', []);
      expect(data.hash).not.toEqual(initialData.hash);
    });
  });
});
