/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
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

export declare const CACHE_VERSION: 2;
export declare type CACHE_VERSION = typeof CACHE_VERSION;
declare class MockPlugin implements FileMapPlugin<RawMockMap>, IMockMap {
  readonly name: 'mocks';
  constructor(
    options: Readonly<{
      console: typeof console;
      mocksPattern: RegExp;
      rawMockMap?: RawMockMap;
      rootDir: Path;
      throwOnModuleCollision: boolean;
    }>,
  );
  initialize(initOptions: FileMapPluginInitOptions<RawMockMap>): Promise<void>;
  getMockModule(name: string): null | undefined | Path;
  bulkUpdate(delta: FileMapDelta): Promise<void>;
  onNewOrModifiedFile(relativeFilePath: Path): void;
  onRemovedFile(relativeFilePath: Path): void;
  getSerializableSnapshot(): RawMockMap;
  assertValid(): void;
  getCacheKey(): string;
}
export default MockPlugin;
