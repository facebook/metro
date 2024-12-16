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
import {RootPathUtils} from './RootPathUtils';
import nullthrows from 'nullthrows';
import path from 'path';

export default class MockMap implements IMockMap {
  +#mocksPattern: RegExp;
  +#raw: RawMockMap;
  +#rootDir: Path;
  +#pathUtils: RootPathUtils;
  +#console: typeof console;
  #throwOnModuleCollision: boolean;

  constructor({
    console,
    mocksPattern,
    rawMockMap,
    rootDir,
    throwOnModuleCollision,
  }: {
    console: typeof console,
    mocksPattern: RegExp,
    rawMockMap?: ?RawMockMap,
    rootDir: Path,
    throwOnModuleCollision: boolean,
  }) {
    this.#mocksPattern = mocksPattern;
    this.#raw = rawMockMap ?? {mocks: new Map(), duplicates: new Map()};
    this.#rootDir = rootDir;
    this.#console = console;
    this.#pathUtils = new RootPathUtils(rootDir);
    this.#throwOnModuleCollision = throwOnModuleCollision;
  }

  getMockModule(name: string): ?Path {
    const mockPath =
      this.#raw.mocks.get(name) || this.#raw.mocks.get(name + '/index');
    if (typeof mockPath !== 'string') {
      return null;
    }
    return this.#pathUtils.normalToAbsolute(mockPath);
  }

  onNewOrModifiedFile(absoluteFilePath: Path): void {
    if (!this.#mocksPattern.test(absoluteFilePath)) {
      return;
    }

    const mockName = getMockName(absoluteFilePath);
    const existingMockPath = this.#raw.mocks.get(mockName);
    const newMockPath = this.#pathUtils.absoluteToNormal(absoluteFilePath);

    if (existingMockPath != null) {
      if (existingMockPath !== newMockPath) {
        let duplicates = this.#raw.duplicates.get(mockName);
        if (duplicates == null) {
          duplicates = new Set([existingMockPath, newMockPath]);
          this.#raw.duplicates.set(mockName, duplicates);
        } else {
          duplicates.add(newMockPath);
        }

        this.#console.warn(this.#getMessageForDuplicates(mockName, duplicates));
      }
    }

    // If there are duplicates and we don't throw, the latest mock wins.
    // This is to preserve backwards compatibility, but it's unpredictable.
    this.#raw.mocks.set(mockName, newMockPath);
  }

  onRemovedFile(absoluteFilePath: Path): void {
    if (!this.#mocksPattern.test(absoluteFilePath)) {
      return;
    }
    const mockName = getMockName(absoluteFilePath);
    const duplicates = this.#raw.duplicates.get(mockName);
    if (duplicates != null) {
      const relativePath = this.#pathUtils.absoluteToNormal(absoluteFilePath);
      duplicates.delete(relativePath);
      if (duplicates.size === 1) {
        this.#raw.duplicates.delete(mockName);
      }
      // Set the mock to a remaining duplicate. Should never be empty.
      const remaining = nullthrows(duplicates.values().next().value);
      this.#raw.mocks.set(mockName, remaining);
    } else {
      this.#raw.mocks.delete(mockName);
    }
  }

  getSerializableSnapshot(): RawMockMap {
    return {
      mocks: new Map(this.#raw.mocks),
      duplicates: new Map(
        [...this.#raw.duplicates].map(([k, v]) => [k, new Set(v)]),
      ),
    };
  }

  assertValid(): void {
    if (!this.#throwOnModuleCollision) {
      return;
    }
    // Throw an aggregate error for each duplicate.
    const errors = [];
    for (const [mockName, relativePaths] of this.#raw.duplicates) {
      errors.push(this.#getMessageForDuplicates(mockName, relativePaths));
    }
    if (errors.length > 0) {
      throw new Error(
        `Mock map has ${errors.length} error${errors.length > 1 ? 's' : ''}:\n${errors.join('\n')}`,
      );
    }
  }

  #getMessageForDuplicates(
    mockName: string,
    duplicates: $ReadOnlySet<string>,
  ): string {
    return (
      'Duplicate manual mock found for `' +
      mockName +
      '`:\n' +
      [...duplicates]
        .map(
          relativePath =>
            '    * <rootDir>' +
            path.sep +
            this.#pathUtils.absoluteToNormal(relativePath) +
            '\n',
        )
        .join('')
    );
  }
}
