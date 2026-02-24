/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<81805d051693b746e75928fe6ed3dbca>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/plugins/MockPlugin.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {
  FileMapDelta,
  FileMapPlugin,
  FileMapPluginInitOptions,
  FileMapPluginWorker,
  MockMap as IMockMap,
  Path,
  RawMockMap,
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
  bulkUpdate(delta: FileMapDelta): void;
  onNewOrModifiedFile(relativeFilePath: Path): void;
  onRemovedFile(relativeFilePath: Path): void;
  getSerializableSnapshot(): RawMockMap;
  assertValid(): void;
  getCacheKey(): string;
  getWorker(): null | undefined | FileMapPluginWorker;
}
export default MockPlugin;
