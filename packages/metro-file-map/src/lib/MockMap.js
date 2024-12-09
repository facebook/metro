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

import getMockName from '../getMockName';
import {DuplicateError} from './DuplicateError';
import {RootPathUtils} from './RootPathUtils';
import path from 'path';

export default class MockMap implements IMockMap {
  +#raw: RawMockMap;
  +#rootDir: Path;
  +#pathUtils: RootPathUtils;
  +#console: typeof console;
  #throwOnModuleCollision: boolean;

  constructor({
    console,
    rawMockMap,
    rootDir,
    throwOnModuleCollision,
  }: {
    console: typeof console,
    rawMockMap: RawMockMap,
    rootDir: Path,
    throwOnModuleCollision: boolean,
  }) {
    this.#raw = rawMockMap;
    this.#rootDir = rootDir;
    this.#console = console;
    this.#pathUtils = new RootPathUtils(rootDir);
    this.#throwOnModuleCollision = throwOnModuleCollision;
  }

  getMockModule(name: string): ?Path {
    const mockPath = this.#raw.get(name) || this.#raw.get(name + '/index');
    return mockPath != null ? this.#pathUtils.normalToAbsolute(mockPath) : null;
  }

  addMockModule(absoluteFilePath: Path): void {
    const mockName = getMockName(absoluteFilePath);
    const existingMockPath = this.#raw.get(mockName);
    const newMockPath = this.#pathUtils.absoluteToNormal(absoluteFilePath);

    if (existingMockPath != null) {
      if (existingMockPath !== newMockPath) {
        const method = this.#throwOnModuleCollision ? 'error' : 'warn';

        this.#console[method](
          [
            'metro-file-map: duplicate manual mock found: ' + mockName,
            '  The following files share their name; please delete one of them:',
            '    * <rootDir>' + path.sep + existingMockPath,
            '    * <rootDir>' + path.sep + newMockPath,
            '',
          ].join('\n'),
        );

        if (this.#throwOnModuleCollision) {
          throw new DuplicateError(existingMockPath, newMockPath);
        }
      }
    }

    this.#raw.set(mockName, newMockPath);
  }

  deleteMockModule(absoluteFilePath: Path): void {
    const mockName = getMockName(absoluteFilePath);
    this.#raw.delete(mockName);
  }

  setThrowOnModuleCollision(throwOnModuleCollision: boolean): void {
    this.#throwOnModuleCollision = throwOnModuleCollision;
  }

  getSerializableSnapshot(): RawMockMap {
    return new Map(this.#raw);
  }
}
