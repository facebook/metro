/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<d9402d4670982b1e675e1edd9201cf75>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/plugins/MockPlugin.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {
  FileMapPlugin,
  FileMapPluginInitOptions,
  FileMapPluginWorker,
  MockMap as IMockMap,
  Path,
  RawMockMap,
  ReadonlyFileSystemChanges,
} from '../flow-types';

export declare const CACHE_VERSION: 2;
export declare type CACHE_VERSION = typeof CACHE_VERSION;
export type MockMapOptions = Readonly<{
  console: typeof console;
  mocksPattern: RegExp;
  rawMockMap?: RawMockMap;
  rootDir: Path;
  throwOnModuleCollision: boolean;
}>;
declare class MockPlugin implements FileMapPlugin<RawMockMap, void>, IMockMap {
  readonly name: 'mocks';
  constructor($$PARAM_0$$: MockMapOptions);
  initialize($$PARAM_0$$: FileMapPluginInitOptions<RawMockMap>): Promise<void>;
  getMockModule(name: string): null | undefined | Path;
  onChanged(delta: ReadonlyFileSystemChanges<null | undefined | void>): void;
  getSerializableSnapshot(): RawMockMap;
  assertValid(): void;
  getCacheKey(): string;
  getWorker(): null | undefined | FileMapPluginWorker;
}
export default MockPlugin;
