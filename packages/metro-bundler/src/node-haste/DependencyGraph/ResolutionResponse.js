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

const NO_OPTIONS = {};

class ResolutionResponse<TModule: {hash(): string}, TOptions> {
  dependencies: Array<TModule>;
  mainModuleId: ?(number | string);
  mocks: mixed;
  numPrependedDependencies: number;
  options: TOptions;

  // This is monkey-patched from Resolver.
  getModuleId: ?() => number;

  _mappings: {[hash: string]: Array<[string, TModule]>};
  _finalized: boolean;
  _mainModule: ?TModule;

  constructor(options: TOptions) {
    this.dependencies = [];
    this.mainModuleId = null;
    this.mocks = null;
    this.numPrependedDependencies = 0;
    this.options = options;
    /* $FlowFixMe(>=0.56.0 site=react_native_fb) This comment suppresses an
     * error found when Flow v0.56 was deployed. To see the error delete this
     * comment and run Flow. */
    this._mappings = Object.create(null);
    this._finalized = false;
  }

  copy(properties: {
    dependencies?: Array<TModule>,
    mainModuleId?: number,
    mocks?: mixed,
  }): ResolutionResponse<TModule, TOptions> {
    const {
      dependencies = this.dependencies,
      mainModuleId = this.mainModuleId,
      mocks = this.mocks,
    } = properties;

    const numPrependedDependencies =
      dependencies === this.dependencies ? this.numPrependedDependencies : 0;

    /* $FlowFixMe: Flow doesn't like Object.assign on class-made objects. */
    return Object.assign(new this.constructor(this.options), this, {
      dependencies,
      mainModuleId,
      mocks,
      numPrependedDependencies,
    });
  }

  _assertNotFinalized() {
    if (this._finalized) {
      throw new Error('Attempted to mutate finalized response.');
    }
  }

  _assertFinalized() {
    if (!this._finalized) {
      throw new Error('Attempted to access unfinalized response.');
    }
  }

  finalize(): Promise<this> {
    return Promise.resolve().then(() => {
      /* $FlowFixMe: _mainModule is not initialized in the constructor. */
      this.mainModuleId = this._mainModule.getName();
      this._finalized = true;
      return this;
    });
  }

  pushDependency(module: TModule) {
    this._assertNotFinalized();
    if (this.dependencies.length === 0) {
      this._mainModule = module;
    }

    this.dependencies.push(module);
  }

  prependDependency(module: TModule) {
    this._assertNotFinalized();
    this.dependencies.unshift(module);
    this.numPrependedDependencies += 1;
  }

  setResolvedDependencyPairs(
    module: TModule,
    pairs: Array<[string, TModule]>,
    options: {ignoreFinalized?: boolean} = NO_OPTIONS,
  ) {
    if (!options.ignoreFinalized) {
      this._assertNotFinalized();
    }
    const hash = module.hash();
    if (this._mappings[hash] == null) {
      this._mappings[hash] = pairs;
    }
  }

  setMocks(mocks: mixed) {
    this.mocks = mocks;
  }

  getResolvedDependencyPairs(
    module: TModule,
  ): $ReadOnlyArray<[string, TModule]> {
    this._assertFinalized();
    return this._mappings[module.hash()] || [];
  }
}

module.exports = ResolutionResponse;
