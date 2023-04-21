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

'use strict';

import type {RequireContextParams} from '../ModuleGraph/worker/collectDependencies';
import type {RequireContext} from '../lib/contextModule';
import type {Graph} from './Graph';
import type {JsTransformOptions} from 'metro-transform-worker';

import CountingSet from '../lib/CountingSet';

export type MixedOutput = {
  +data: mixed,
  +type: string,
};

export type AsyncDependencyType = 'async' | 'prefetch' | 'weak';

export type TransformResultDependency = {
  /**
   * The literal name provided to a require or import call. For example 'foo' in
   * case of `require('foo')`.
   */
  +name: string,

  /**
   * Extra data returned by the dependency extractor.
   */
  +data: {
    /**
     * A locally unique key for this dependency within the current module.
     */
    +key: string,
    /**
     * If not null, this dependency is due to a dynamic `import()` or `__prefetchImport()` call.
     */
    +asyncType: AsyncDependencyType | null,
    /**
     * The dependency is enclosed in a try/catch block.
     */
    +isOptional?: boolean,

    +locs: $ReadOnlyArray<BabelSourceLocation>,

    /** Context for requiring a collection of modules. */
    +contextParams?: RequireContextParams,
  },
};

export type Dependency = {
  +absolutePath: string,
  +data: TransformResultDependency,
};

export type Module<T = MixedOutput> = {
  +dependencies: Map<string, Dependency>,
  +inverseDependencies: CountingSet<string>,
  +output: $ReadOnlyArray<T>,
  +path: string,
  +getSource: () => Buffer,
};

export type Dependencies<T = MixedOutput> = Map<string, Module<T>>;
export type ReadOnlyDependencies<T = MixedOutput> = $ReadOnlyMap<
  string,
  Module<T>,
>;

export type TransformInputOptions = $Diff<
  JsTransformOptions,
  {
    inlinePlatform: boolean,
    inlineRequires: boolean,
    ...
  },
>;

export type GraphInputOptions = $ReadOnly<{
  entryPoints: $ReadOnlySet<string>,
  // Unused in core but useful for custom serializers / experimentalSerializerHook
  transformOptions: TransformInputOptions,
}>;

export interface ReadOnlyGraph<T = MixedOutput> {
  +entryPoints: $ReadOnlySet<string>;
  // Unused in core but useful for custom serializers / experimentalSerializerHook
  +transformOptions: $ReadOnly<TransformInputOptions>;
  +dependencies: ReadOnlyDependencies<T>;
}

export type {Graph};

export type TransformResult<T = MixedOutput> = $ReadOnly<{
  dependencies: $ReadOnlyArray<TransformResultDependency>,
  output: $ReadOnlyArray<T>,
}>;

export type TransformResultWithSource<T = MixedOutput> = $ReadOnly<{
  ...TransformResult<T>,
  getSource: () => Buffer,
}>;

export type TransformFn<T = MixedOutput> = (
  string,
  ?RequireContext,
) => Promise<TransformResultWithSource<T>>;
export type AllowOptionalDependenciesWithOptions = {
  +exclude: Array<string>,
};
export type AllowOptionalDependencies =
  | boolean
  | AllowOptionalDependenciesWithOptions;

export type BundlerResolution = $ReadOnly<{
  type: 'sourceFile',
  filePath: string,
}>;

export type Options<T = MixedOutput> = {
  +resolve: (from: string, to: string) => BundlerResolution,
  +transform: TransformFn<T>,
  +transformOptions: TransformInputOptions,
  +onProgress: ?(numProcessed: number, total: number) => mixed,
  +lazy: boolean,
  +unstable_allowRequireContext: boolean,
  +unstable_enablePackageExports: boolean,
  +shallow: boolean,
};

export type DeltaResult<T = MixedOutput> = {
  +added: Map<string, Module<T>>,
  +modified: Map<string, Module<T>>,
  +deleted: Set<string>,
  +reset: boolean,
};

export type SerializerOptions = $ReadOnly<{
  asyncRequireModulePath: string,
  createModuleId: string => number,
  dev: boolean,
  getRunModuleStatement: (number | string) => string,
  includeAsyncPaths: boolean,
  inlineSourceMap: ?boolean,
  modulesOnly: boolean,
  processModuleFilter: (module: Module<>) => boolean,
  projectRoot: string,
  runBeforeMainModule: $ReadOnlyArray<string>,
  runModule: boolean,
  serverRoot: string,
  sourceMapUrl: ?string,
  sourceUrl: ?string,
}>;
