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

import type {
  RequireContextParams,
  ContextMode,
} from '../ModuleGraph/worker/collectDependencies';
import type {PrivateState} from './graphOperations';
import type {JsTransformOptions} from 'metro-transform-worker';

import CountingSet from '../lib/CountingSet';

export type RequireContext = {
  /** Absolute file path pointing to the root directory of the context. */
  from?: string,
  /* Should search for files recursively. Optional, default `true` when `require.context` is used */
  recursive: boolean,
  /* Filename filter pattern for use in `require.context`. Optional, default `.*` (any file) when `require.context` is used */
  filter: RegExp,
  /** Mode for resolving dynamic dependencies. Defaults to `sync` */
  mode: ContextMode,
};

export type MixedOutput = {
  +data: mixed,
  +type: string,
};

export type AsyncDependencyType = 'async' | 'prefetch';

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
     * The condition for splitting on this dependency edge.
     */
    +splitCondition?: {
      +mobileConfigName: string,
    },
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
  +contextParams?: RequireContext,
  +dependencies: Map<string, Dependency>,
  +inverseDependencies: CountingSet<string>,
  +output: $ReadOnlyArray<T>,
  +path: string,
  +getSource: () => Buffer,
};

export type Dependencies<T = MixedOutput> = Map<string, Module<T>>;

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

export type Graph<T = MixedOutput> = {
  ...$ReadOnly<GraphInputOptions>,
  dependencies: Dependencies<T>,
  +importBundleNames: Set<string>,
  +privateState: PrivateState,
};

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

export type Options<T = MixedOutput> = {
  +resolve: (from: string, to: string, context?: ?RequireContext) => string,
  +transform: TransformFn<T>,
  +transformOptions: TransformInputOptions,
  +onProgress: ?(numProcessed: number, total: number) => mixed,
  +experimentalImportBundleSupport: boolean,
  +unstable_allowRequireContext: boolean,
  +shallow: boolean,
};

export type DeltaResult<T = MixedOutput> = {
  +added: Map<string, Module<T>>,
  +modified: Map<string, Module<T>>,
  +deleted: Set<string>,
  +reset: boolean,
};

export type SerializerOptions = {
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
  +serverRoot: string,
  +sourceMapUrl: ?string,
  +sourceUrl: ?string,
};
