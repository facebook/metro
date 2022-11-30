/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import HasteMap from '../index';
import path from 'path';

const rootDir = path.join(__dirname, './test_dotfiles_root');

const commonOptions = {
  extensions: ['js'],
  maxWorkers: 1,
  platforms: [],
  resetCache: true,
  retainAllFiles: true,
  rootDir,
  roots: [rootDir],
  healthCheck: {
    enabled: false,
    interval: 10000,
    timeout: 1000,
    filePrefix: '.metro-file-map-health-check',
  },
};

test('watchman crawler and node crawler both include dotfiles', async () => {
  const hasteMapWithWatchman = new HasteMap({
    ...commonOptions,
    useWatchman: true,
  });

  const hasteMapWithNode = new HasteMap({
    ...commonOptions,
    useWatchman: false,
  });

  const [builtHasteMapWithWatchman, builtHasteMapWithNode] = await Promise.all([
    hasteMapWithWatchman.build(),
    hasteMapWithNode.build(),
  ]);

  expect(
    builtHasteMapWithWatchman.fileSystem.matchFiles('.eslintrc.js'),
  ).toHaveLength(1);

  expect(builtHasteMapWithWatchman.fileSystem.getAllFiles().sort()).toEqual(
    builtHasteMapWithNode.fileSystem.getAllFiles().sort(),
  );
});
