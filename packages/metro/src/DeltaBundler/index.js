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

const DeltaTransformer = require('./DeltaTransformer');

import type Bundler from '../Bundler';
import type {BundleOptions} from '../shared/types.flow';
import type {DeltaEntry} from './DeltaTransformer';

export type PostProcessModules = (
  modules: $ReadOnlyArray<DeltaEntry>,
  entryFile: string,
) => $ReadOnlyArray<DeltaEntry>;

export type MainOptions = {|
  getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,
  polyfillModuleNames: $ReadOnlyArray<string>,
  postProcessModules?: PostProcessModules,
|};

/**
 * `DeltaBundler` uses the `DeltaTransformer` to build bundle deltas. This
 * module handles all the transformer instances so it can support multiple
 * concurrent clients requesting their own deltas. This is done through the
 * `clientId` param (which maps a client to a specific delta transformer).
 */
class DeltaBundler {
  _bundler: Bundler;
  _options: MainOptions;
  _deltaTransformers: Map<string, DeltaTransformer> = new Map();
  _currentId: number = 0;

  constructor(bundler: Bundler, options: MainOptions) {
    this._bundler = bundler;
    this._options = options;
  }

  end() {
    this._deltaTransformers.forEach(DeltaTransformer => DeltaTransformer.end());
    this._deltaTransformers = new Map();
  }

  endTransformer(clientId: string) {
    const deltaTransformer = this._deltaTransformers.get(clientId);

    if (deltaTransformer) {
      deltaTransformer.end();

      this._deltaTransformers.delete(clientId);
    }
  }

  async getDeltaTransformer(
    clientId: string,
    options: BundleOptions,
  ): Promise<DeltaTransformer> {
    let deltaTransformer = this._deltaTransformers.get(clientId);

    if (!deltaTransformer) {
      deltaTransformer = await DeltaTransformer.create(
        this._bundler,
        this._options,
        options,
      );

      this._deltaTransformers.set(clientId, deltaTransformer);
    }

    return deltaTransformer;
  }

  getPostProcessModulesFn(
    entryPoint: string,
  ): (modules: $ReadOnlyArray<DeltaEntry>) => $ReadOnlyArray<DeltaEntry> {
    const postProcessFn = this._options.postProcessModules;

    if (!postProcessFn) {
      return modules => modules;
    }

    return entries => postProcessFn(entries, entryPoint);
  }
}

module.exports = DeltaBundler;
