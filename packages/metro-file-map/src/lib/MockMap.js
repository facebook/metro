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

import type {MockMap as IMockMap, Path, RawMockMap} from '../flow-types';

import {RootPathUtils} from './RootPathUtils';

export default class MockMap implements IMockMap {
  +#raw: RawMockMap;
  +#rootDir: Path;
  +#pathUtils: RootPathUtils;

  constructor({rawMockMap, rootDir}: {rawMockMap: RawMockMap, rootDir: Path}) {
    this.#raw = rawMockMap;
    this.#rootDir = rootDir;
    this.#pathUtils = new RootPathUtils(rootDir);
  }

  getMockModule(name: string): ?Path {
    const mockPath = this.#raw.get(name) || this.#raw.get(name + '/index');
    return mockPath != null ? this.#pathUtils.normalToAbsolute(mockPath) : null;
  }
}
