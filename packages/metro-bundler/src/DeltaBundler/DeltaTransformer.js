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

const createModuleIdFactory = require('../lib/createModuleIdFactory');

const {EventEmitter} = require('events');

import type {RawMapping} from '../Bundler/source-map';
import type Bundler from '../Bundler';
import type {Options as JSTransformerOptions} from '../JSTransformer/worker';
import type Resolver from '../Resolver';
import type {MappingsMap} from '../lib/SourceMap';
import type Module from '../node-haste/Module';
import type {Options as BundleOptions} from './';
import type {DependencyEdges} from './traverseDependencies';

export type DeltaEntryType =
  | 'asset'
  | 'module'
  | 'script'
  | 'comment'
  | 'require';

export type DeltaEntry = {|
  +code: string,
  +map: ?Array<RawMapping>,
  +name: string,
  +path: string,
  +source: string,
  +type: DeltaEntryType,
|};

export type DeltaEntries = Map<number, ?DeltaEntry>;

export type DeltaTransformResponse = {|
  +pre: DeltaEntries,
  +post: DeltaEntries,
  +delta: DeltaEntries,
  +inverseDependencies: {[key: string]: $ReadOnlyArray<string>},
  +reset: boolean,
|};

type Options = {|
  +getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,
  +polyfillModuleNames: $ReadOnlyArray<string>,
|};

const globalCreateModuleId = createModuleIdFactory();

/**
 * This class is in charge of creating the delta bundle with the actual
 * transformed source code for each of the modified modules. For each modified
 * module it returns a `DeltaModule` object that contains the basic information
 * about that file. Modules that have been deleted contain a `null` module
 * parameter.
 *
 * The actual return format is the following:
 *
 *   {
 *     pre: [{id, module: {}}],   Scripts to be prepended before the actual
 *                                modules.
 *     post: [{id, module: {}}],  Scripts to be appended after all the modules
 *                                (normally the initial require() calls).
 *     delta: [{id, module: {}}], Actual bundle modules (dependencies).
 *   }
 */
class DeltaTransformer extends EventEmitter {
  _bundler: Bundler;
  _resolver: Resolver;
  _getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>;
  _polyfillModuleNames: $ReadOnlyArray<string>;
  _getModuleId: ({path: string}) => number;
  _deltaCalculator: DeltaCalculator;
  _bundleOptions: BundleOptions;
  _currentBuildPromise: ?Promise<DeltaTransformResponse>;

  constructor(
    bundler: Bundler,
    resolver: Resolver,
    deltaCalculator: DeltaCalculator,
    options: Options,
    bundleOptions: BundleOptions,
  ) {
    super();

    this._bundler = bundler;
    this._resolver = resolver;
    this._deltaCalculator = deltaCalculator;
    this._getPolyfills = options.getPolyfills;
    this._polyfillModuleNames = options.polyfillModuleNames;
    this._bundleOptions = bundleOptions;

    // Only when isolateModuleIDs is true the Module IDs of this instance are
    // sandboxed from the rest.
    // Isolating them makes sense when we want to get consistent module IDs
    // between different builds of the same bundle (for example when building
    // production builds), while coupling them makes sense when we want
    // different bundles to share the same ids (on HMR, where we need to patch
    // the correct module).
    this._getModuleId = this._bundleOptions.isolateModuleIDs
      ? createModuleIdFactory()
      : globalCreateModuleId;

    this._deltaCalculator.on('change', this._onFileChange);
  }

  static async create(
    bundler: Bundler,
    options: Options,
    bundleOptions: BundleOptions,
  ): Promise<DeltaTransformer> {
    const resolver = await bundler.getResolver();

    const deltaCalculator = new DeltaCalculator(
      bundler,
      resolver.getDependencyGraph(),
      bundleOptions,
    );

    return new DeltaTransformer(
      bundler,
      resolver,
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
    this._deltaCalculator.removeListener('change', this._onFileChange);

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

    const transformerOptions = await this._deltaCalculator.getTransformerOptions();
    const dependencyEdges = this._deltaCalculator.getDependencyEdges();

    // Get the transformed source code of each modified/added module.
    const modifiedDelta = await this._transformModules(
      Array.from(modified.values()),
      transformerOptions,
      dependencyEdges,
    );

    deleted.forEach(id => {
      modifiedDelta.set(this._getModuleId({path: id}), null);
    });

    // Return the source code that gets prepended to all the modules. This
    // contains polyfills and startup code (like the require() implementation).
    const prependSources = reset
      ? await this._getPrepend(transformerOptions, dependencyEdges)
      : new Map();

    // Return the source code that gets appended to all the modules. This
    // contains the require() calls to startup the execution of the modules.
    const appendSources = reset
      ? await this._getAppend(dependencyEdges)
      : new Map();

    // Inverse dependencies are needed for HMR.
    const inverseDependencies = this._getInverseDependencies(dependencyEdges);

    return {
      pre: prependSources,
      post: appendSources,
      delta: modifiedDelta,
      inverseDependencies,
      reset,
    };
  }

  async _getPrepend(
    transformOptions: JSTransformerOptions,
    dependencyEdges: DependencyEdges,
  ): Promise<DeltaEntries> {
    // Get all the polyfills from the relevant option params (the
    // `getPolyfills()` method and the `polyfillModuleNames` variable).
    const polyfillModuleNames = this._getPolyfills({
      platform: this._bundleOptions.platform,
    }).concat(this._polyfillModuleNames);

    // The module system dependencies are scripts that need to be included at
    // the very beginning of the bundle (before any polyfill).
    const moduleSystemDeps = this._resolver.getModuleSystemDependencies({
      dev: this._bundleOptions.dev,
    });

    const modules = moduleSystemDeps.concat(
      polyfillModuleNames.map((polyfillModuleName, idx) =>
        this._resolver.getDependencyGraph().createPolyfill({
          file: polyfillModuleName,
          id: polyfillModuleName,
          dependencies: [],
        }),
      ),
    );

    return await this._transformModules(
      modules,
      transformOptions,
      dependencyEdges,
    );
  }

  async _getAppend(dependencyEdges: DependencyEdges): Promise<DeltaEntries> {
    // Get the absolute path of the entry file, in order to be able to get the
    // actual correspondant module (and its moduleId) to be able to add the
    // correct require(); call at the very end of the bundle.
    const absPath = this._resolver
      .getDependencyGraph()
      .getAbsolutePath(this._bundleOptions.entryFile);
    const entryPointModule = this._resolver.getModuleForPath(absPath);

    // First, get the modules correspondant to all the module names defined in
    // the `runBeforeMainModule` config variable. Then, append the entry point
    // module so the last thing that gets required is the entry point.
    const append = new Map(
      this._bundleOptions.runBeforeMainModule
        .map(path => this._resolver.getModuleForPath(path))
        .concat(entryPointModule)
        .filter(module => dependencyEdges.has(module.path))
        .map(this._getModuleId)
        .map(moduleId => {
          const code = `;require(${JSON.stringify(moduleId)})`;
          const name = 'require-' + String(moduleId);
          const path = name + '.js';

          return [
            moduleId,
            {
              code,
              map: null,
              name,
              source: code,
              path,
              type: 'require',
            },
          ];
        }),
    );

    if (this._bundleOptions.sourceMapUrl) {
      const code = '//# sourceMappingURL=' + this._bundleOptions.sourceMapUrl;

      append.set(this._getModuleId({path: '/sourcemap.js'}), {
        code,
        map: null,
        name: 'sourcemap.js',
        path: '/sourcemap.js',
        source: code,
        type: 'comment',
      });
    }

    return append;
  }

  /**
   * Converts the paths in the inverse dependendencies to module ids.
   */
  _getInverseDependencies(
    dependencyEdges: DependencyEdges,
  ): {[key: string]: $ReadOnlyArray<string>} {
    const output = Object.create(null);

    for (const [path, {inverseDependencies}] of dependencyEdges.entries()) {
      output[this._getModuleId({path})] = Array.from(
        inverseDependencies,
      ).map(dep => this._getModuleId({path: dep}));
    }

    /* $FlowFixMe(>=0.56.0 site=react_native_fb) This comment suppresses an
     * error found when Flow v0.56 was deployed. To see the error delete this
     * comment and run Flow. */
    return output;
  }

  async _transformModules(
    modules: Array<Module>,
    transformOptions: JSTransformerOptions,
    dependencyEdges: DependencyEdges,
  ): Promise<DeltaEntries> {
    return new Map(
      await Promise.all(
        modules.map(module =>
          this._transformModule(module, transformOptions, dependencyEdges),
        ),
      ),
    );
  }

  async _transformModule(
    module: Module,
    transformOptions: JSTransformerOptions,
    dependencyEdges: DependencyEdges,
  ): Promise<[number, ?DeltaEntry]> {
    const name = module.getName();
    const metadata = await this._getMetadata(module, transformOptions);
    const edge = dependencyEdges.get(module.path);
    const dependencyPairs = edge ? edge.dependencies : new Map();

    const wrapped = this._bundleOptions.wrapModules
      ? this._resolver.wrapModule({
          module,
          getModuleId: this._getModuleId,
          dependencyPairs,
          dependencyOffsets: metadata.dependencyOffsets || [],
          name,
          code: metadata.code,
          map: metadata.map,
          minify: this._bundleOptions.minify,
          dev: this._bundleOptions.dev,
        })
      : {
          code: this._resolver.resolveRequires(
            module,
            this._getModuleId,
            metadata.code,
            dependencyPairs,
            metadata.dependencyOffsets || [],
          ),
          map: metadata.map,
        };

    // Ignore the Source Maps if the output of the transformer is not our
    // custom rawMapping data structure, since the Delta bundler cannot process
    // them. This can potentially happen when the minifier is enabled (since
    // uglifyJS only returns standard Source Maps).
    const map = Array.isArray(wrapped.map) ? wrapped.map : undefined;

    return [
      this._getModuleId(module),
      {
        code: ';' + wrapped.code,
        map,
        name,
        source: metadata.source,
        path: module.path,
        type: this._getModuleType(module),
      },
    ];
  }

  _getModuleType(module: Module): DeltaEntryType {
    if (module.isAsset()) {
      return 'asset';
    }

    if (module.isPolyfill()) {
      return 'script';
    }

    return 'module';
  }

  async _getMetadata(
    module: Module,
    transformOptions: JSTransformerOptions,
  ): Promise<{
    +code: string,
    +dependencyOffsets: ?Array<number>,
    +map: ?MappingsMap,
    +source: string,
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
        source: '',
      };
    }

    return await module.read(transformOptions);
  }

  _onFileChange = () => {
    this.emit('change');
  };
}

module.exports = DeltaTransformer;
