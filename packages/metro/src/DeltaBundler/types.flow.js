/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

import type {JsTransformOptions} from 'metro-transform-worker';

export type MixedOutput = {|
  +data: mixed,
  +type: string,
|};

export type AsyncDependencyType = 'async' | 'prefetch';

export type TransformResultDependency = {|
  /**
   * The literal name provided to a require or import call. For example 'foo' in
   * case of `require('foo')`.
   */
  +name: string,

  /**
   * Extra data returned by the dependency extractor. Whatever is added here is
   * blindly piped by Metro to the serializers.
   */
  +data: {|
    /**
     * If not null, this dependency is due to a dynamic `import()` or `__prefetchImport()` call.
     */
    +asyncType: AsyncDependencyType | null,
    /**
     * The condition for splitting on this dependency edge.
     */
    +splitCondition?: {|
      +mobileConfigName: string,
    |},
    /**
     * The dependency is enclosed in a try/catch block.
     */
    +isOptional?: boolean,

    +locs: $ReadOnlyArray<BabelSourceLocation>,
  |},
|};

export type Dependency = {|
  +absolutePath: string,
  +data: TransformResultDependency,
|};

export type Module<T = MixedOutput> = {|
  +dependencies: Map<string, Dependency>,
  +inverseDependencies: Set<string>,
  +output: $ReadOnlyArray<T>,
  +path: string,
  +getSource: () => Buffer,
|};

export type Dependencies<T = MixedOutput> = Map<string, Module<T>>;

export type TransformInputOptions = $Diff<
  JsTransformOptions,
  {
    inlinePlatform: boolean,
    inlineRequires: boolean,
    ...
  },
>;

export type Graph<T = MixedOutput> = {|
  dependencies: Dependencies<T>,
  importBundleNames: Set<string>,
  +entryPoints: $ReadOnlyArray<string>,
  // Unused in core but useful for custom serializers / experimentalSerializerHook
  +transformOptions: TransformInputOptions,
|};

export type TransformResult<T = MixedOutput> = $ReadOnly<{|
  dependencies: $ReadOnlyArray<TransformResultDependency>,
  output: $ReadOnlyArray<T>,
|}>;

export type TransformResultWithSource<T = MixedOutput> = $ReadOnly<{|
  ...TransformResult<T>,
  getSource: () => Buffer,
|}>;

export type TransformFn<T = MixedOutput> = string => Promise<
  TransformResultWithSource<T>,
>;
export type AllowOptionalDependenciesWithOptions = {|
  +exclude: Array<string>,
|};
export type AllowOptionalDependencies =
  | boolean
  | AllowOptionalDependenciesWithOptions;

export type Options<T = MixedOutput> = {|
  +resolve: (from: string, to: string) => string,
  +transform: TransformFn<T>,
  +transformOptions: TransformInputOptions,
  +onProgress: ?(numProcessed: number, total: number) => mixed,
  +experimentalImportBundleSupport: boolean,
  +shallow: boolean,
|};

export type DeltaResult<T = MixedOutput> = {|
  +added: Map<string, Module<T>>,
  +modified: Map<string, Module<T>>,
  +deleted: Set<string>,
  +reset: boolean,
|};

export type SerializerOptions = {|
  +asyncRequireModulePath: string,
  +createModuleId: string => number,
  +dev: boolean,
  +getRunModuleStatement: (number | string) => string,
  +inlineSourceMap: ?boolean,
  +modulesOnly: boolean,
  +processModuleFilter: (module: Module<>) => boolean,
  +projectRoot: string,
  +runBeforeMainModule: $ReadOnlyArray<string>,
  +runModule: boolean,
  +sourceMapUrl: ?string,
  +sourceUrl: ?string,
|};
