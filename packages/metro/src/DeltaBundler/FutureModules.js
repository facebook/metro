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

import type {FutureModule, FutureModulesRawMap} from './types';

export class FutureModules {
  #map_: FutureModulesRawMap;

  constructor(initialMap?: ?FutureModulesRawMap) {
    this.#map_ = new Map(initialMap ?? []);
  }

  toRawMap(): FutureModulesRawMap {
    return this.#map_;
  }

  addRawMap(other: ?FutureModulesRawMap) {
    other?.forEach((value, key) => this.#map_.set(key, value));
  }

  get(mixedPath: string): ?FutureModule {
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

  set(relativePath: string, fModule: FutureModule): void {
    this.#map_.set(relativePath, fModule);
  }
}
