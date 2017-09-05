/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @format
 */

'use strict';

const DeltaCalculator = require('./DeltaCalculator');

import type Bundler from '../Bundler';
import type {Options as JSTransformerOptions} from '../JSTransformer/worker';
import type Resolver from '../Resolver';
import type {MappingsMap} from '../lib/SourceMap';
import type Module from '../node-haste/Module';
import type {Options as BundleOptions} from './';

export type DeltaTransformResponse = {
  +pre: ?string,
  +post: ?string,
  +delta: {[key: string]: ?string},
  +inverseDependencies: {[key: string]: $ReadOnlyArray<string>},
};

type Options = {|
  +getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,
  +polyfillModuleNames: $ReadOnlyArray<string>,
|};

/**
 * This class is in charge of creating the delta bundle with the actual
 * transformed source code for each of the modified modules.
 *
 * The delta bundle format is the following:
 *
 *   {
 *     pre: '...',   // source code to be prepended before all the modules.
 *     post: '...',  // source code to be appended after all the modules
 *                   // (normally here lay the require() call for the starup).
 *     delta: {
 *       27: '...',  // transformed source code of a modified module.
 *       56: null,   // deleted module.
 *     },
 *   }
 */
class DeltaTransformer {
  _bundler: Bundler;
  _getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>;
  _polyfillModuleNames: $ReadOnlyArray<string>;
  _getModuleId: ({path: string}) => number;
  _deltaCalculator: DeltaCalculator;
  _bundleOptions: BundleOptions;
  _currentBuildPromise: ?Promise<DeltaTransformResponse>;

  constructor(
    bundler: Bundler,
    deltaCalculator: DeltaCalculator,
    options: Options,
    bundleOptions: BundleOptions,
  ) {
    this._bundler = bundler;
    this._deltaCalculator = deltaCalculator;
    this._getPolyfills = options.getPolyfills;
    this._polyfillModuleNames = options.polyfillModuleNames;
    this._getModuleId = this._bundler.getGetModuleIdFn();
    this._bundleOptions = bundleOptions;
  }

  static async create(
    bundler: Bundler,
    options: Options,
    bundleOptions: BundleOptions,
  ): Promise<DeltaTransformer> {
    const deltaCalculator = await DeltaCalculator.create(
      bundler,
      bundleOptions,
    );

    return new DeltaTransformer(
      bundler,
      deltaCalculator,
      options,
      bundleOptions,
    );
  }

  /**
   * Destroy the Delta Transformer and its calculator. This should be used to
   * clean up memory and resources once this instance is not used anymore.
   */
  end() {
    return this._deltaCalculator.end();
  }

  /**
   * Main method to calculate the bundle delta. It returns a DeltaResult,
   * which contain the source code of the modified and added modules and the
   * list of removed modules.
   */
  async getDelta(): Promise<DeltaTransformResponse> {
    // If there is already a build in progress, wait until it finish to start
    // processing a new one (delta transformer doesn't support concurrent
    // builds).
    if (this._currentBuildPromise) {
      await this._currentBuildPromise;
    }

    this._currentBuildPromise = this._getDelta();

    let result;

    try {
      result = await this._currentBuildPromise;
    } finally {
      this._currentBuildPromise = null;
    }

    return result;
  }

  async _getDelta(): Promise<DeltaTransformResponse> {
    // Calculate the delta of modules.
    const {modified, deleted, reset} = await this._deltaCalculator.getDelta();

    const transformerOptions = this._deltaCalculator.getTransformerOptions();
    const dependencyPairs = this._deltaCalculator.getDependencyPairs();
    const resolver = await this._bundler.getResolver();

    // Get the transformed source code of each modified/added module.
    const modifiedDelta = await this._transformModules(
      modified,
      resolver,
      transformerOptions,
      dependencyPairs,
    );

    const deletedDelta = Object.create(null);
    deleted.forEach(id => {
      deletedDelta[this._getModuleId({path: id})] = null;
    });

    // Return the source code that gets prepended to all the modules. This
    // contains polyfills and startup code (like the require() implementation).
    const prependSources = reset
      ? await this._getPrepend(transformerOptions, dependencyPairs)
      : null;

    // Return the source code that gets appended to all the modules. This
    // contains the require() calls to startup the execution of the modules.
    const appendSources = reset
      ? await this._getAppend(
          dependencyPairs,
          this._deltaCalculator.getModulesByName(),
        )
      : null;

    // Inverse dependencies are needed for HMR.
    const inverseDependencies = this._getInverseDependencies(
      this._deltaCalculator.getInverseDependencies(),
    );

    return {
      pre: prependSources,
      post: appendSources,
      delta: {...modifiedDelta, ...deletedDelta},
      inverseDependencies,
      reset,
    };
  }

  async _getPrepend(
    transformOptions: JSTransformerOptions,
    dependencyPairs: Map<string, $ReadOnlyArray<[string, Module]>>,
  ): Promise<string> {
    const resolver = await this._bundler.getResolver();

    // Get all the polyfills from the relevant option params (the
    // `getPolyfills()` method and the `polyfillModuleNames` variable).
    const polyfillModuleNames = this._getPolyfills({
      platform: this._bundleOptions.platform,
    }).concat(this._polyfillModuleNames);

    // The module system dependencies are scripts that need to be included at
    // the very beginning of the bundle (before any polyfill).
    const moduleSystemDeps = resolver.getModuleSystemDependencies({
      dev: this._bundleOptions.dev,
    });

    const modules = moduleSystemDeps.concat(
      polyfillModuleNames.map((polyfillModuleName, idx) =>
        resolver.getDependencyGraph().createPolyfill({
          file: polyfillModuleName,
          id: polyfillModuleName,
          dependencies: [],
        }),
      ),
    );

    const sources = await Promise.all(
      modules.map(async module => {
        const result = await this._transformModule(
          module,
          resolver,
          transformOptions,
          dependencyPairs,
        );
        return result[1];
      }),
    );

    return sources.join('\n;');
  }

  async _getAppend(
    dependencyPairs: Map<string, $ReadOnlyArray<[string, Module]>>,
    modulesByName: Map<string, Module>,
  ): Promise<string> {
    const resolver = await this._bundler.getResolver();

    // Get the absolute path of the entry file, in order to be able to get the
    // actual correspondant module (and its moduleId) to be able to add the
    // correct require(); call at the very end of the bundle.
    const absPath = resolver
      .getDependencyGraph()
      .getAbsolutePath(this._bundleOptions.entryFile);
    const entryPointModule = await this._bundler.getModuleForPath(absPath);

    // First, get the modules correspondant to all the module names defined in
    // the `runBeforeMainModule` config variable. Then, append the entry point
    // module so the last thing that gets required is the entry point.
    const sources = this._bundleOptions.runBeforeMainModule
      .map(name => modulesByName.get(name))
      .concat(entryPointModule)
      .filter(Boolean)
      .map(this._getModuleId)
      .map(moduleId => `;require(${JSON.stringify(moduleId)});`);

    return sources.join('\n');
  }

  /**
   * Converts the paths in the inverse dependendencies to module ids.
   */
  _getInverseDependencies(
    inverseDependencies: Map<string, Set<string>>,
  ): {[key: string]: $ReadOnlyArray<string>} {
    const output = Object.create(null);

    for (const [key, dependencies] of inverseDependencies) {
      output[this._getModuleId({path: key})] = Array.from(
        dependencies,
      ).map(dep => this._getModuleId({path: dep}));
    }

    return output;
  }

  async _transformModules(
    modules: Map<string, Module>,
    resolver: Resolver,
    transformOptions: JSTransformerOptions,
    dependencyPairs: Map<string, $ReadOnlyArray<[string, Module]>>,
  ): Promise<{[key: string]: string}> {
    const transformedModules = await Promise.all(
      Array.from(modules.values()).map(module =>
        this._transformModule(
          module,
          resolver,
          transformOptions,
          dependencyPairs,
        ),
      ),
    );

    const output = Object.create(null);
    transformedModules.forEach(([id, source]) => {
      output[id] = source;
    });

    return output;
  }

  async _transformModule(
    module: Module,
    resolver: Resolver,
    transformOptions: JSTransformerOptions,
    dependencyPairs: Map<string, $ReadOnlyArray<[string, Module]>>,
  ): Promise<[number, string]> {
    const [name, metadata] = await Promise.all([
      module.getName(),
      this._getMetadata(module, transformOptions),
    ]);

    const dependencyPairsForModule = dependencyPairs.get(module.path) || [];

    const wrapped = this._bundleOptions.wrapModules
      ? await resolver.wrapModule({
          module,
          getModuleId: this._getModuleId,
          dependencyPairs: dependencyPairsForModule,
          dependencyOffsets: metadata.dependencyOffsets || [],
          name,
          code: metadata.code,
          map: metadata.map,
          minify: this._bundleOptions.minify,
          dev: this._bundleOptions.dev,
        })
      : {
          code: resolver.resolveRequires(
            module,
            this._getModuleId,
            metadata.code,
            dependencyPairsForModule,
            metadata.dependencyOffsets || [],
          ),
        };

    return [this._getModuleId(module), wrapped.code];
  }

  async _getMetadata(
    module: Module,
    transformOptions: JSTransformerOptions,
  ): Promise<{
    +code: string,
    +dependencyOffsets: ?Array<number>,
    +map?: ?MappingsMap,
  }> {
    if (module.isAsset()) {
      const asset = await this._bundler.generateAssetObjAndCode(
        module,
        this._bundleOptions.assetPlugins,
        this._bundleOptions.platform,
      );

      return {
        code: asset.code,
        dependencyOffsets: asset.meta.dependencyOffsets,
        map: undefined,
      };
    }

    return await module.read(transformOptions);
  }
}

module.exports = DeltaTransformer;
