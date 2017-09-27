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

const DeltaTransformer = require('./DeltaTransformer');

import type Bundler from '../Bundler';
import type {BundleOptions} from '../Server';

type MainOptions = {|
  getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,
  polyfillModuleNames: $ReadOnlyArray<string>,
|};

export type Options = BundleOptions & {
  +deltaBundleId: ?string,
  +wrapModules: boolean,
};

/**
 * `DeltaBundler` uses the `DeltaTransformer` to build bundle deltas. This
 * module handles all the transformer instances so it can support multiple
 * concurrent clients requesting their own deltas. This is done through the
 * `deltaBundleId` options param (which maps a client to a specific delta
 * transformer).
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

  async getDeltaTransformer(
    options: Options,
  ): Promise<{deltaTransformer: DeltaTransformer, id: string}> {
    let bundleId = options.deltaBundleId;

    // If no bundle id is passed, generate a new one (which is going to be
    // returned as part of the bundle, so the client can later ask for an actual
    // delta).
    if (!bundleId) {
      bundleId = String(this._currentId++);
    }

    let deltaTransformer = this._deltaTransformers.get(bundleId);

    if (!deltaTransformer) {
      deltaTransformer = await DeltaTransformer.create(
        this._bundler,
        this._options,
        {
          ...options, // The Delta Bundler does not support minifying due to
          minify: false, // issues generating the source maps (T21699790).
        },
      );

      this._deltaTransformers.set(bundleId, deltaTransformer);
    }

    return {
      deltaTransformer,
      id: bundleId,
    };
  }
}

module.exports = DeltaBundler;
