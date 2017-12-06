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

const {getAssetData} = require('../util');
const crypto = require('crypto');
const fs = require('fs');

require('image-size').mockReturnValue({
  width: 300,
  height: 200,
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

    return getAssetData('/root/imgs/b.png', 'imgs/b.png').then(data => {
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

    const data = await getAssetData('/root/imgs/b.jpg', 'imgs/b.jpg');

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

      expect(await getAssetData('/root/imgs/b.jpg', 'imgs/b.jpg')).toEqual(
        expect.objectContaining({hash: hash.digest('hex')}),
      );
    });

    it('changes the hash when the passed-in file watcher emits an `all` event', async () => {
      const initialData = await getAssetData('/root/imgs/b.jpg', 'imgs/b.jpg');

      mockFS.root.imgs['b@4x.jpg'] = 'updated data';

      const data = await getAssetData('/root/imgs/b.jpg', 'imgs/b.jpg');
      expect(data.hash).not.toEqual(initialData.hash);
    });
  });
});
