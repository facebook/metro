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

import type {RequireContext} from '../lib/contextModule';
import type {RequireContextParams} from '../ModuleGraph/worker/collectDependencies';
import type {Graph} from './Graph';
import type {JsTransformOptions} from 'metro-transform-worker';

import CountingSet from '../lib/CountingSet';

export type MixedOutput = {
  +data: mixed,
  +type: string,
};

export type AsyncDependencyType = 'async' | 'maybeSync' | 'prefetch' | 'weak';

export type TransformResultDependency = $ReadOnly<{
  /**
   * The literal name provided to a require or import call. For example 'foo' in
   * case of `require('foo')`.
   */
  name: string,

  /**
   * Extra data returned by the dependency extractor.
   */
  data: $ReadOnly<{
    /**
     * A locally unique key for this dependency within the current module.
     */
    key: string,
    /**
     * If not null, this dependency is due to a dynamic `import()` or `__prefetchImport()` call.
     */
    asyncType: AsyncDependencyType | null,
    /**
     * True if the dependency is declared with a static "import x from 'y'" or
     * an import() call.
     */
    isESMImport: boolean,
    /**
     * The dependency is enclosed in a try/catch block.
     */
    isOptional?: boolean,

    locs: $ReadOnlyArray<BabelSourceLocation>,

    /** Context for requiring a collection of modules. */
    contextParams?: RequireContextParams,
  }>,
}>;

export type ResolvedDependency = $ReadOnly<{
  absolutePath: string,
  data: TransformResultDependency,
}>;

export type Dependency =
  | ResolvedDependency
  | $ReadOnly<{
      data: TransformResultDependency,
    }>;

export type Module<T = MixedOutput> = $ReadOnly<{
  dependencies: Map<string, Dependency>,
  inverseDependencies: CountingSet<string>,
  output: $ReadOnlyArray<T>,
  path: string,
  getSource: () => Buffer,
  unstable_transformResultKey?: ?string,
}>;

export type ModuleData<T = MixedOutput> = $ReadOnly<{
  dependencies: $ReadOnlyMap<string, Dependency>,
  resolvedContexts: $ReadOnlyMap<string, RequireContext>,
  output: $ReadOnlyArray<T>,
  getSource: () => Buffer,
  unstable_transformResultKey?: ?string,
}>;

export type Dependencies<T = MixedOutput> = Map<string, Module<T>>;
export type ReadOnlyDependencies<T = MixedOutput> = $ReadOnlyMap<
  string,
  Module<T>,
>;

export type TransformInputOptions = Omit<
  JsTransformOptions,
  'inlinePlatform' | 'inlineRequires',
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
  unstable_transformResultKey?: ?string,
}>;

export type TransformResultWithSource<T = MixedOutput> = $ReadOnly<{
  ...TransformResult<T>,
  getSource: () => Buffer,
}>;

export type TransformFn<T = MixedOutput> = (
  string,
  ?RequireContext,
) => Promise<TransformResultWithSource<T>>;

export type ResolveFn = (
  from: string,
  dependency: TransformResultDependency,
) => BundlerResolution;

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
  +resolve: ResolveFn,
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
  getRunModuleStatement: (
    moduleId: number | string,
    globalPrefix: string,
  ) => string,
  globalPrefix: string,
  includeAsyncPaths: boolean,
  inlineSourceMap: ?boolean,
  modulesOnly: boolean,
  processModuleFilter: (module: Module<>) => boolean,
  projectRoot: string,
  runBeforeMainModule: $ReadOnlyArray<string>,
  runModule: boolean,
  serverRoot: string,
  shouldAddToIgnoreList: (Module<>) => boolean,
  sourceMapUrl: ?string,
  sourceUrl: ?string,
  getSourceUrl: ?(Module<>) => string,
}>;
