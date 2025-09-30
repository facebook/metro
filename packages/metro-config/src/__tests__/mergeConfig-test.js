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

import {mergeConfig} from '../loadConfig';

describe('mergeConfig', () => {
  test('can merge empty configs', () => {
    expect(mergeConfig({}, {})).toStrictEqual({
      resolver: {},
      serializer: {},
      server: {},
      symbolicator: {},
      transformer: {},
      watcher: {
        healthCheck: {},
        unstable_autoSaveCache: {},
        watchman: {},
      },
    });
  });
});
