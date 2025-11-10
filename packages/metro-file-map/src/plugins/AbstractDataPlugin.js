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
  FileMapPluginWorker,
} from '../flow-types';

import invariant from 'invariant';

export type AbstractDataPluginOptions = $ReadOnly<{
  name: string,
  workerParams: FileMapPluginWorker,
}>;

type LookupFn<T> = FileMapPluginInitOptions<void, T>['files']['lookup'];

export default class AbstractDataPlugin<T> implements FileMapPlugin<void, T> {
  +name: string;
  +#workerParams: FileMapPluginWorker;
  #initialized: boolean = false;

  #lookup: ?LookupFn<T>;
  #processFile: ?(mixedPath: string) => T;

  constructor(options: AbstractDataPluginOptions) {
    this.name = options.name;
    this.#workerParams = options.workerParams;
  }

  async initialize({
    files: {lookup},
    processFile,
  }: FileMapPluginInitOptions<void, T>): Promise<void> {
    this.#initialized = true;
    this.#lookup = lookup;
    this.#processFile = processFile;
  }

  lookup(mixedPath: string): ReturnType<LookupFn<T>> {
    invariant(
      this.#lookup != null,
      'Plugin must be initialized before lookup()',
    );
    return this.#lookup(mixedPath);
  }

  processFile(mixedPath: string): T {
    invariant(
      this.#processFile != null,
      'Plugin must be initialized before lookup()',
    );
    return this.#processFile(mixedPath);
  }

  getSerializableSnapshot() {}

  async bulkUpdate(delta: FileMapDelta<?T>): Promise<void> {
    for (const [normalPath, data] of delta.removed) {
      this.onRemovedFile(normalPath, data);
    }
    for (const [normalPath, data] of delta.addedOrModified) {
      this.onNewOrModifiedFile(normalPath, data);
    }
  }

  onNewOrModifiedFile(relativeFilePath: string, data: ?T) {}

  onRemovedFile(relativeFilePath: string, data: ?T) {}

  assertValid(): void {}

  getCacheKey(): string {
    throw new Error(
      'AbstractDataPlugin: getCacheKey must be implemented by subclass: ' +
        this.name,
    );
  }

  getWorker(): FileMapPluginWorker {
    return this.#workerParams;
  }
}
