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

import type {
  FileMapDelta,
  FileMapPlugin,
  FileMapPluginInitOptions,
  MockMap as IMockMap,
  Path,
  RawMockMap,
} from '../flow-types';

import normalizePathSeparatorsToPosix from '../lib/normalizePathSeparatorsToPosix';
import normalizePathSeparatorsToSystem from '../lib/normalizePathSeparatorsToSystem';
import {RootPathUtils} from '../lib/RootPathUtils';
import getMockName from './mocks/getMockName';
import nullthrows from 'nullthrows';
import path from 'path';

export const CACHE_VERSION = 2;

export default class MockPlugin implements FileMapPlugin<RawMockMap>, IMockMap {
  +name = 'mocks';

  +#mocksPattern: RegExp;
  #raw: RawMockMap;
  +#rootDir: Path;
  +#pathUtils: RootPathUtils;
  +#console: typeof console;
  #throwOnModuleCollision: boolean;

  constructor({
    console,
    mocksPattern,
    rawMockMap = {
      mocks: new Map(),
      duplicates: new Map(),
      version: CACHE_VERSION,
    },
    rootDir,
    throwOnModuleCollision,
  }: {
    console: typeof console,
    mocksPattern: RegExp,
    rawMockMap?: RawMockMap,
    rootDir: Path,
    throwOnModuleCollision: boolean,
  }) {
    this.#mocksPattern = mocksPattern;
    if (rawMockMap.version !== CACHE_VERSION) {
      throw new Error('Incompatible state passed to MockPlugin');
    }
    this.#raw = rawMockMap;
    this.#rootDir = rootDir;
    this.#console = console;
    this.#pathUtils = new RootPathUtils(rootDir);
    this.#throwOnModuleCollision = throwOnModuleCollision;
  }

  async initialize({
    files,
    pluginState,
  }: FileMapPluginInitOptions<RawMockMap>): Promise<void> {
    if (pluginState != null && pluginState.version === this.#raw.version) {
      // Use cached state directly if available
      this.#raw = pluginState;
    } else {
      // Otherwise, traverse all files to rebuild
      await this.bulkUpdate({
        addedOrModified: [
          ...files.metadataIterator({
            includeNodeModules: false,
            includeSymlinks: false,
          }),
        ].map(({canonicalPath, metadata}) => [canonicalPath, metadata]),
        removed: [],
      });
    }
  }

  getMockModule(name: string): ?Path {
    const mockPosixRelativePath =
      this.#raw.mocks.get(name) || this.#raw.mocks.get(name + '/index');
    if (typeof mockPosixRelativePath !== 'string') {
      return null;
    }
    return this.#pathUtils.normalToAbsolute(
      normalizePathSeparatorsToSystem(mockPosixRelativePath),
    );
  }

  async bulkUpdate(delta: FileMapDelta): Promise<void> {
    // Process removals first so that moves aren't treated as duplicates.
    for (const [relativeFilePath] of delta.removed) {
      this.onRemovedFile(relativeFilePath);
    }
    for (const [relativeFilePath] of delta.addedOrModified) {
      this.onNewOrModifiedFile(relativeFilePath);
    }
  }

  onNewOrModifiedFile(relativeFilePath: Path): void {
    const absoluteFilePath = this.#pathUtils.normalToAbsolute(relativeFilePath);
    if (!this.#mocksPattern.test(absoluteFilePath)) {
      return;
    }

    const mockName = getMockName(absoluteFilePath);
    const posixRelativePath = normalizePathSeparatorsToPosix(relativeFilePath);

    const existingMockPosixPath = this.#raw.mocks.get(mockName);
    if (existingMockPosixPath != null) {
      if (existingMockPosixPath !== posixRelativePath) {
        let duplicates = this.#raw.duplicates.get(mockName);
        if (duplicates == null) {
          duplicates = new Set([existingMockPosixPath, posixRelativePath]);
          this.#raw.duplicates.set(mockName, duplicates);
        } else {
          duplicates.add(posixRelativePath);
        }

        this.#console.warn(this.#getMessageForDuplicates(mockName, duplicates));
      }
    }

    // If there are duplicates and we don't throw, the latest mock wins.
    // This is to preserve backwards compatibility, but it's unpredictable.
    this.#raw.mocks.set(mockName, posixRelativePath);
  }

  onRemovedFile(relativeFilePath: Path): void {
    const absoluteFilePath = this.#pathUtils.normalToAbsolute(relativeFilePath);
    if (!this.#mocksPattern.test(absoluteFilePath)) {
      return;
    }
    const mockName = getMockName(absoluteFilePath);
    const duplicates = this.#raw.duplicates.get(mockName);
    if (duplicates != null) {
      const posixRelativePath =
        normalizePathSeparatorsToPosix(relativeFilePath);
      duplicates.delete(posixRelativePath);
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
      version: this.#raw.version,
    };
  }

  assertValid(): void {
    if (!this.#throwOnModuleCollision) {
      return;
    }
    // Throw an aggregate error for each duplicate.
    const errors = [];
    for (const [mockName, relativePosixPaths] of this.#raw.duplicates) {
      errors.push(this.#getMessageForDuplicates(mockName, relativePosixPaths));
    }
    if (errors.length > 0) {
      throw new Error(
        `Mock map has ${errors.length} error${errors.length > 1 ? 's' : ''}:\n${errors.join('\n')}`,
      );
    }
  }

  #getMessageForDuplicates(
    mockName: string,
    relativePosixPaths: $ReadOnlySet<string>,
  ): string {
    return (
      'Duplicate manual mock found for `' +
      mockName +
      '`:\n' +
      [...relativePosixPaths]
        .map(
          relativePosixPath =>
            '    * <rootDir>' +
            path.sep +
            this.#pathUtils.absoluteToNormal(
              normalizePathSeparatorsToSystem(relativePosixPath),
            ) +
            '\n',
        )
        .join('')
    );
  }
}
