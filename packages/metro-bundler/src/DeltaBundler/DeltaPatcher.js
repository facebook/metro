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

import type {DeltaBundle} from './';

/**
 * This is a reference client for the Delta Bundler: it maintains cached the
 * last patched bundle delta and it's capable of applying new Deltas received
 * from the Bundler and stringify them to convert them into a full bundle.
 */
class DeltaPatcher {
  _lastBundle = {
    pre: '',
    post: '',
    modules: {},
  };
  _initialized = false;

  /**
   * Applies a Delta Bundle to the current bundle.
   */
  applyDelta(deltaBundle: DeltaBundle) {
    // Make sure that the first received delta is a fresh one.
    if (!this._initialized && !deltaBundle.reset) {
      throw new Error(
        'DeltaPatcher should receive a fresh Delta when being initialized',
      );
    }

    this._initialized = true;

    // Reset the current delta when we receive a fresh delta.
    if (deltaBundle.reset) {
      this._lastBundle = {
        pre: '',
        post: '',
        modules: {},
      };
    }

    // Override the prepended sources.
    if (deltaBundle.pre) {
      this._lastBundle.pre = deltaBundle.pre;
    }

    // Override the appended sources.
    if (deltaBundle.post) {
      this._lastBundle.post = deltaBundle.post;
    }

    // Patch the received modules.
    for (const i in deltaBundle.delta) {
      if (deltaBundle.delta[i] == null) {
        delete this._lastBundle.modules[i];
      } else {
        this._lastBundle.modules[i] = deltaBundle.delta[i];
      }
    }

    return this;
  }

  /**
   * Converts the current delta bundle to a standard string bundle, ready to
   * be interpreted by any JS VM.
   */
  stringify() {
    return []
      .concat(
        this._lastBundle.pre,
        Object.values(this._lastBundle.modules),
        this._lastBundle.post,
      )
      .join('\n;');
  }
}

module.exports = DeltaPatcher;
