/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const AssetModule = require('./AssetModule');
const Module = require('./Module');
const Package = require('./Package');
const Polyfill = require('./Polyfill');

const toLocalPath = require('./lib/toLocalPath');

import type {GlobalTransformCache} from '../lib/GlobalTransformCache';
import type {
  TransformCache,
  GetTransformCacheKey,
} from '../lib/TransformCaching';
import type {Reporter} from '../lib/reporting';
import type DependencyGraphHelpers from './DependencyGraph/DependencyGraphHelpers';
import type {TransformCode} from './Module';

type GetClosestPackageFn = (filePath: string) => ?string;

type Options = {|
  assetDependencies: Array<string>,
  depGraphHelpers: DependencyGraphHelpers,
  experimentalCaches: boolean,
  hasteImplModulePath?: string,
  getClosestPackage: GetClosestPackageFn,
  getTransformCacheKey: GetTransformCacheKey,
  globalTransformCache: ?GlobalTransformCache,
  roots: $ReadOnlyArray<string>,
  reporter: Reporter,
  resetCache: boolean,
  transformCache: TransformCache,
  transformCode: TransformCode,
|};

class ModuleCache {
  _assetDependencies: Array<string>;
  _depGraphHelpers: DependencyGraphHelpers;
  _experimentalCaches: boolean;
  _getClosestPackage: GetClosestPackageFn;
  _getTransformCacheKey: GetTransformCacheKey;
  _globalTransformCache: ?GlobalTransformCache;
  _moduleCache: {[filePath: string]: Module, __proto__: null};
  _packageCache: {[filePath: string]: Package, __proto__: null};
  _packageModuleMap: WeakMap<Module, string>;
  _platforms: Set<string>;
  _transformCode: TransformCode;
  _reporter: Reporter;
  _roots: $ReadOnlyArray<string>;
  _opts: Options;

  constructor(options: Options, platforms: Set<string>) {
    const {
      assetDependencies,
      depGraphHelpers,
      experimentalCaches,
      getClosestPackage,
      getTransformCacheKey,
      globalTransformCache,
      roots,
      reporter,
      transformCode,
    } = options;
    this._opts = options;
    this._assetDependencies = assetDependencies;
    this._experimentalCaches = experimentalCaches;
    this._getClosestPackage = getClosestPackage;
    this._getTransformCacheKey = getTransformCacheKey;
    this._globalTransformCache = globalTransformCache;
    this._depGraphHelpers = depGraphHelpers;
    this._moduleCache = Object.create(null);
    this._packageCache = Object.create(null);
    this._packageModuleMap = new WeakMap();
    this._platforms = platforms;
    this._transformCode = transformCode;
    this._reporter = reporter;
    this._roots = roots;
  }

  getModule(filePath: string): Module {
    if (!this._moduleCache[filePath]) {
      this._moduleCache[filePath] = new Module({
        depGraphHelpers: this._depGraphHelpers,
        experimentalCaches: this._experimentalCaches,
        file: filePath,
        getTransformCacheKey: this._getTransformCacheKey,
        localPath: toLocalPath(this._roots, filePath),
        moduleCache: this,
        options: this._getModuleOptions(),
        transformCode: this._transformCode,
      });
    }
    return this._moduleCache[filePath];
  }

  getAllModules() {
    return this._moduleCache;
  }

  getAssetModule(filePath: string) {
    if (!this._moduleCache[filePath]) {
      /* FixMe: AssetModule does not need all these options. This is because
       * this is an incorrect OOP design in the first place: AssetModule, being
       * simpler than a normal Module, should not inherit the Module class.
       */
      this._moduleCache[filePath] = new AssetModule({
        depGraphHelpers: this._depGraphHelpers,
        experimentalCaches: this._experimentalCaches,
        file: filePath,
        getTransformCacheKey: this._getTransformCacheKey,
        globalTransformCache: this._globalTransformCache,
        localPath: toLocalPath(this._roots, filePath),
        moduleCache: this,
        options: this._getModuleOptions(),
        reporter: this._reporter,
        transformCode: this._transformCode,
      });
    }
    return this._moduleCache[filePath];
  }

  getPackage(filePath: string): Package {
    if (!this._packageCache[filePath]) {
      this._packageCache[filePath] = new Package({
        file: filePath,
      });
    }
    return this._packageCache[filePath];
  }

  getPackageForModule(module: Module): ?Package {
    let packagePath = this._packageModuleMap.get(module);
    if (packagePath) {
      if (this._packageCache[packagePath]) {
        return this._packageCache[packagePath];
      } else {
        this._packageModuleMap.delete(module);
      }
    }

    packagePath = this._getClosestPackage(module.path);
    if (!packagePath) {
      return null;
    }

    this._packageModuleMap.set(module, packagePath);
    return this.getPackage(packagePath);
  }

  createPolyfill({file}: {file: string}) {
    /* $FlowFixMe: there are missing arguments. */
    return new Polyfill({
      depGraphHelpers: this._depGraphHelpers,
      file,
      getTransformCacheKey: this._getTransformCacheKey,
      localPath: toLocalPath(this._roots, file),
      moduleCache: this,
      options: this._getModuleOptions(),
      transformCode: this._transformCode,
    });
  }

  processFileChange(type: string, filePath: string) {
    if (this._moduleCache[filePath]) {
      this._moduleCache[filePath].invalidate();
      delete this._moduleCache[filePath];
    }
    if (this._packageCache[filePath]) {
      this._packageCache[filePath].invalidate();
      delete this._packageCache[filePath];
    }
  }

  _getModuleOptions() {
    return {
      reporter: this._opts.reporter,
      transformCache: this._opts.transformCache,
      globalTransformCache: this._opts.globalTransformCache,
      resetCache: this._opts.resetCache,
      hasteImplModulePath: this._opts.hasteImplModulePath,
    };
  }
}

module.exports = ModuleCache;
