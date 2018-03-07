/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const crypto = require('crypto');
const docblock = require('jest-docblock');
const fs = require('fs');
const invariant = require('fbjs/lib/invariant');
const isAbsolutePath = require('absolute-path');
const jsonStableStringify = require('json-stable-stringify');
const path = require('path');

import type {
  TransformedCode,
  Options as WorkerOptions,
} from '../JSTransformer/worker';
import type {GlobalTransformCache} from '../lib/GlobalTransformCache';
import type {
  TransformCache,
  GetTransformCacheKey,
  ReadTransformProps,
} from '../lib/TransformCaching';
import type {Reporter} from '../lib/reporting';
import type DependencyGraphHelpers from './DependencyGraph/DependencyGraphHelpers';
import type ModuleCache from './ModuleCache';
import type {LocalPath} from './lib/toLocalPath';
import type {MetroSourceMapSegmentTuple} from 'metro-source-map';

export type ReadResult = {
  +code: string,
  +dependencies: $ReadOnlyArray<string>,
  +map: Array<MetroSourceMapSegmentTuple>,
  +source: string,
};

export type CachedReadResult = ?ReadResult;

export type TransformCode = (
  module: Module,
  sourceCode: string,
  transformOptions: WorkerOptions,
) => Promise<TransformedCode>;

export type HasteImpl = {
  getHasteName(filePath: string): string | void,
  // This exists temporarily to enforce consistency while we deprecate
  // @providesModule.
  enforceHasteNameMatches?: (
    filePath: string,
    expectedName: string | void,
  ) => void,
};

export type Options = {
  globalTransformCache: ?GlobalTransformCache,
  hasteImplModulePath?: string,
  reporter: Reporter,
  resetCache: boolean,
  transformCache: TransformCache,
};

export type ConstructorArgs = {
  depGraphHelpers: DependencyGraphHelpers,
  experimentalCaches: boolean,
  file: string,
  getTransformCacheKey: GetTransformCacheKey,
  localPath: LocalPath,
  moduleCache: ModuleCache,
  options: Options,
  transformCode: TransformCode,
};

type DocBlock = {+[key: string]: string};

class Module {
  localPath: LocalPath;
  path: string;
  type: string;

  _experimentalCaches: boolean;

  _moduleCache: ModuleCache;
  _transformCode: TransformCode;
  _getTransformCacheKey: GetTransformCacheKey;
  _depGraphHelpers: DependencyGraphHelpers;
  _options: Options;

  _docBlock: ?DocBlock;
  _hasteNameCache: ?{+hasteName: ?string};
  _sourceCode: ?string;
  _readPromises: Map<string, Promise<ReadResult>>;

  _readResultsByOptionsKey: Map<string, CachedReadResult>;

  constructor({
    depGraphHelpers,
    experimentalCaches,
    file,
    getTransformCacheKey,
    localPath,
    moduleCache,
    options,
    transformCode,
  }: ConstructorArgs) {
    if (!isAbsolutePath(file)) {
      throw new Error('Expected file to be absolute path but got ' + file);
    }

    this.localPath = localPath;
    this.path = file;
    this.type = 'Module';

    this._experimentalCaches = experimentalCaches;

    this._moduleCache = moduleCache;
    this._transformCode = transformCode;
    this._getTransformCacheKey = getTransformCacheKey;
    this._depGraphHelpers = depGraphHelpers;
    this._options = options || {};

    this._readPromises = new Map();
    this._readResultsByOptionsKey = new Map();
  }

  isHaste(): boolean {
    return this._getHasteName() != null;
  }

  getName(): string {
    // TODO: T26134860 Used for debugging purposes only; disabled with the new
    // caches.
    if (this._experimentalCaches) {
      return path.basename(this.path);
    }

    if (this.isHaste()) {
      const name = this._getHasteName();
      if (name != null) {
        return name;
      }
    }

    const p = this.getPackage();

    if (!p) {
      // Name is local path
      return this.localPath;
    }

    const packageName = p.getName();
    if (!packageName) {
      return this.path;
    }

    return path
      .join(packageName, path.relative(p.root, this.path))
      .replace(/\\/g, '/');
  }

  getPackage() {
    return this._moduleCache.getPackageForModule(this);
  }

  /**
   * We don't need to invalidate the TranformCache itself because it guarantees
   * itself that if a source code changed we won't return the cached transformed
   * code.
   */
  invalidate() {
    this._sourceCode = null;

    // TODO: T26134860 Caches present in Module are not used with experimental
    // caches, except for the one related to source code.
    if (this._experimentalCaches) {
      return;
    }

    this._readPromises.clear();
    this._readResultsByOptionsKey.clear();
    this._docBlock = null;
    this._hasteNameCache = null;
  }

  _readSourceCode(): string {
    if (this._sourceCode == null) {
      this._sourceCode = fs.readFileSync(this.path, 'utf8');
    }
    return this._sourceCode;
  }

  _readDocBlock(): DocBlock {
    if (this._docBlock == null) {
      this._docBlock = docblock.parse(docblock.extract(this._readSourceCode()));
    }
    return this._docBlock;
  }

  _getHasteName(): ?string {
    if (this._hasteNameCache == null) {
      this._hasteNameCache = {hasteName: this._readHasteName()};
    }
    return this._hasteNameCache.hasteName;
  }

  /**
   * If a custom Haste implementation is provided, then we use it to determine
   * the actual Haste name instead of "@providesModule".
   * `enforceHasteNameMatches` has been added to that it is easier to
   * transition from a system using "@providesModule" to a system using another
   * custom system, by throwing if inconsistencies are detected. For example,
   * we could verify that the file's basename (ex. "bar/foo.js") is the same as
   * the "@providesModule" name (ex. "foo").
   */
  _readHasteName(): ?string {
    const hasteImplModulePath = this._options.hasteImplModulePath;
    if (hasteImplModulePath == null) {
      return this._readHasteNameFromDocBlock();
    }
    // eslint-disable-next-line no-useless-call
    const HasteImpl = (require.call(null, hasteImplModulePath): HasteImpl);
    if (HasteImpl.enforceHasteNameMatches != null) {
      const name = this._readHasteNameFromDocBlock();
      HasteImpl.enforceHasteNameMatches(this.path, name || undefined);
    }
    return HasteImpl.getHasteName(this.path);
  }

  /**
   * We extract the Haste name from the `@providesModule` docbloc field. This is
   * not allowed for modules living in `node_modules`, except if they are
   * whitelisted.
   */
  _readHasteNameFromDocBlock(): ?string {
    const moduleDocBlock = this._readDocBlock();
    const {providesModule} = moduleDocBlock;
    if (providesModule && !this._depGraphHelpers.isNodeModulesDir(this.path)) {
      return /^\S+/.exec(providesModule)[0];
    }
    return null;
  }

  /**
   * To what we read from the cache or worker, we need to add id and source.
   */
  _finalizeReadResult(source: string, result: TransformedCode): ReadResult {
    return {...result, source};
  }

  async _transformCodeFor(
    cacheProps: ReadTransformProps,
  ): Promise<TransformedCode> {
    const {_transformCode} = this;
    invariant(_transformCode != null, 'missing code transform funtion');
    const {sourceCode, transformOptions} = cacheProps;
    return await _transformCode(this, sourceCode, transformOptions);
  }

  async _transformAndStoreCodeGlobally(
    cacheProps: ReadTransformProps,
    globalCache: GlobalTransformCache,
  ): Promise<TransformedCode> {
    const result = await this._transformCodeFor(cacheProps);
    globalCache.store(globalCache.keyOf(cacheProps), result);
    return result;
  }

  async _getTransformedCode(
    cacheProps: ReadTransformProps,
  ): Promise<TransformedCode> {
    const globalCache = this._options.globalTransformCache;
    if (globalCache == null || !globalCache.shouldFetch(cacheProps)) {
      return await this._transformCodeFor(cacheProps);
    }
    const globalCachedResult = await globalCache.fetch(
      globalCache.keyOf(cacheProps),
    );
    if (globalCachedResult != null) {
      return globalCachedResult;
    }
    return await this._transformAndStoreCodeGlobally(cacheProps, globalCache);
  }

  async _getAndCacheTransformedCode(
    cacheProps: ReadTransformProps,
  ): Promise<TransformedCode> {
    const result = await this._getTransformedCode(cacheProps);
    this._options.transformCache.writeSync({...cacheProps, result});
    return result;
  }

  /**
   * Shorthand for reading both from cache or from fresh for all call sites that
   * are asynchronous by default.
   */
  async read(transformOptions: WorkerOptions): Promise<ReadResult> {
    // TODO: T26134860 Cache layer lives inside the transformer now; just call
    // the transform method.
    if (this._experimentalCaches) {
      const sourceCode = this._readSourceCode();

      return {
        ...(await this._transformCode(this, sourceCode, transformOptions)),
        sourceCode,
      };
    }

    const cached = this.readCached(transformOptions);

    if (cached != null) {
      return cached;
    }
    return this.readFresh(transformOptions);
  }

  /**
   * Same as `readFresh`, but reads from the cache instead of transforming
   * the file from source. This has the benefit of being synchronous. As a
   * result it is possible to read many cached Module in a row, synchronously.
   */
  readCached(transformOptions: WorkerOptions): CachedReadResult {
    const key = stableObjectHash(transformOptions || {});
    let result = this._readResultsByOptionsKey.get(key);
    if (result != null) {
      return result;
    }
    result = this._readFromTransformCache(transformOptions, key);
    this._readResultsByOptionsKey.set(key, result);
    return result;
  }

  /**
   * Read again from the TransformCache, on disk. `readCached` should be favored
   * so it's faster in case the results are already in memory.
   */
  _readFromTransformCache(
    transformOptions: WorkerOptions,
    transformOptionsKey: string,
  ): CachedReadResult {
    const cacheProps = this._getCacheProps(
      transformOptions,
      transformOptionsKey,
    );
    const cachedResult = this._options.transformCache.readSync(cacheProps);

    if (cachedResult == null) {
      return null;
    }
    return this._finalizeReadResult(cacheProps.sourceCode, cachedResult);
  }

  /**
   * Gathers relevant data about a module: source code, transformed code,
   * dependencies, etc. This function reads and transforms the source from
   * scratch. We don't repeat the same work as `readCached` because we assume
   * call sites have called it already.
   */
  readFresh(transformOptions: WorkerOptions): Promise<ReadResult> {
    const key = stableObjectHash(transformOptions || {});
    const promise = this._readPromises.get(key);
    if (promise != null) {
      return promise;
    }
    const freshPromise = (async () => {
      const cacheProps = this._getCacheProps(transformOptions, key);
      const freshResult = await this._getAndCacheTransformedCode(cacheProps);
      const finalResult = this._finalizeReadResult(
        cacheProps.sourceCode,
        freshResult,
      );
      this._readResultsByOptionsKey.set(key, finalResult);
      return finalResult;
    })();
    this._readPromises.set(key, freshPromise);
    return freshPromise;
  }

  _getCacheProps(transformOptions: WorkerOptions, transformOptionsKey: string) {
    const sourceCode = this._readSourceCode();
    const getTransformCacheKey = this._getTransformCacheKey;
    return {
      filePath: this.path,
      localPath: this.localPath,
      sourceCode,
      getTransformCacheKey,
      transformOptions,
      transformOptionsKey,
      cacheOptions: {
        resetCache: this._options.resetCache,
        reporter: this._options.reporter,
      },
    };
  }

  hash() {
    return `Module : ${this.path}`;
  }

  isAsset() {
    return false;
  }

  isPolyfill() {
    return false;
  }
}

// use weak map to speed up hash creation of known objects
const knownHashes = new WeakMap();
function stableObjectHash(object) {
  let digest = knownHashes.get(object);
  if (!digest) {
    digest = crypto
      .createHash('md5')
      .update(jsonStableStringify(object))
      .digest('base64');
    knownHashes.set(object, digest);
  }

  return digest;
}

module.exports = Module;
