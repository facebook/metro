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

import type {VirtualModule, VirtualModulesRawMap} from './types';

export class VirtualModules {
  #map_: VirtualModulesRawMap;

  constructor(initialMap?: ?VirtualModulesRawMap) {
    this.#map_ = new Map(initialMap ?? []);
  }

  toRawMap(): VirtualModulesRawMap {
    return this.#map_;
  }

  addRawMap(other: ?VirtualModulesRawMap) {
    other?.forEach((value, key) => this.#map_.set(key, value));
  }

  get(mixedPath: string): ?VirtualModule {
    if (this.#map_.has(mixedPath)) {
      return this.#map_.get(mixedPath);
    }

    const key = this.#map_
      .keys()
      .find(relativePath => mixedPath.endsWith(relativePath));

    if (key == null) {
      return null;
    }

    return this.#map_.get(key);
  }

  set(relativePath: string, vModule: VirtualModule): void {
    this.#map_.set(relativePath, vModule);
  }
}
