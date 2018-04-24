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

const fs = require('fs');
const isAbsolutePath = require('absolute-path');

import type {
  TransformedCode,
  Options as WorkerOptions,
} from '../JSTransformer/worker';
import type {TransformResultDependency} from '../ModuleGraph/types.flow';
import type ModuleCache from './ModuleCache';
import type {LocalPath} from './lib/toLocalPath';
import type {MetroSourceMapSegmentTuple} from 'metro-source-map';

export type ReadResult = {
  +code: string,
  +dependencies: $ReadOnlyArray<TransformResultDependency>,
  +map: Array<MetroSourceMapSegmentTuple>,
  +source: string,
};

export type CachedReadResult = ?ReadResult;

export type TransformCode = (
  module: Module,
  sourceCode: ?string,
  transformOptions: WorkerOptions,
) => Promise<TransformedCode>;

export type ConstructorArgs = {
  file: string,
  localPath: LocalPath,
  moduleCache: ModuleCache,
  transformCode: TransformCode,
};

class Module {
  localPath: LocalPath;
  path: string;
  type: string;

  _moduleCache: ModuleCache;
  _transformCode: TransformCode;
  _sourceCode: ?string;

  constructor({file, localPath, moduleCache, transformCode}: ConstructorArgs) {
    if (!isAbsolutePath(file)) {
      throw new Error('Expected file to be absolute path but got ' + file);
    }

    this.localPath = localPath;
    this.path = file;
    this.type = 'Module';

    this._moduleCache = moduleCache;
    this._transformCode = transformCode;
  }

  isHaste(): boolean {
    return false;
  }

  getName(): string {
    return this.localPath;
  }

  getPackage() {
    return this._moduleCache.getPackageForModule(this);
  }

  invalidate() {
    this._sourceCode = null;
  }

  _readSourceCode(): string {
    if (this._sourceCode == null) {
      this._sourceCode = fs.readFileSync(this.path, 'utf8');
    }

    return this._sourceCode;
  }

  async read(transformOptions: WorkerOptions): Promise<ReadResult> {
    const result: TransformedCode = await this._transformCode(
      this,
      null, // Source code is read on the worker
      transformOptions,
    );

    const module = this;

    return {
      code: result.code,
      dependencies: result.dependencies,
      map: result.map,
      get source() {
        return module._readSourceCode();
      },
    };
  }

  readCached(transformOptions: WorkerOptions): null {
    return null;
  }

  readFresh(transformOptions: WorkerOptions): Promise<ReadResult> {
    return this.read(transformOptions);
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

module.exports = Module;
