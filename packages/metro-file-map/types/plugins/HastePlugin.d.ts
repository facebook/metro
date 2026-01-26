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
  Console,
  FileMapDelta,
  FileMapPlugin,
  FileMapPluginInitOptions,
  FileMapPluginWorker,
  HasteConflict,
  HasteMap,
  HasteMapItemMetadata,
  HTypeValue,
  Path,
  PerfLogger,
} from '../flow-types';

export type HasteMapOptions = Readonly<{
  console?: null | undefined | Console;
  enableHastePackages: boolean;
  hasteImplModulePath: null | undefined | string;
  perfLogger?: null | undefined | PerfLogger;
  platforms: ReadonlySet<string>;
  rootDir: Path;
  failValidationOnConflicts: boolean;
}>;
declare class HastePlugin
  implements HasteMap, FileMapPlugin<null, string | null>
{
  readonly name: 'haste';
  constructor(options: HasteMapOptions);
  initialize(
    $$PARAM_0$$: FileMapPluginInitOptions<null, string | null>,
  ): Promise<void>;
  getSerializableSnapshot(): null;
  getModule(
    name: string,
    platform?: null | undefined | string,
    supportsNativePlatform?: null | undefined | boolean,
    type?: null | undefined | HTypeValue,
  ): null | undefined | Path;
  getModuleNameByPath(mixedPath: Path): null | undefined | string;
  getPackage(
    name: string,
    platform: null | undefined | string,
    _supportsNativePlatform?: null | undefined | boolean,
  ): null | undefined | Path;
  bulkUpdate(delta: FileMapDelta<null | undefined | string>): Promise<void>;
  onNewOrModifiedFile(
    relativeFilePath: string,
    id: null | undefined | string,
  ): void;
  setModule(id: string, module: HasteMapItemMetadata): void;
  onRemovedFile(
    relativeFilePath: string,
    moduleName: null | undefined | string,
  ): void;
  assertValid(): void;
  computeConflicts(): Array<HasteConflict>;
  getCacheKey(): string;
  getWorker(): FileMapPluginWorker;
}
export default HastePlugin;
