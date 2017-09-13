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

const {fromRawMappings} = require('../Bundler/source-map');

import type {DeltaBundle} from './';

/**
 * This is a reference client for the Delta Bundler: it maintains cached the
 * last patched bundle delta and it's capable of applying new Deltas received
 * from the Bundler and stringify them to convert them into a full bundle.
 */
class DeltaPatcher {
  _lastBundle = {
    pre: new Map(),
    post: new Map(),
    modules: new Map(),
  };
  _initialized = false;
  _lastNumModifiedFiles = 0;
  _lastModifiedDate = new Date();

  /**
   * Applies a Delta Bundle to the current bundle.
   */
  applyDelta(deltaBundle: DeltaBundle): DeltaPatcher {
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
        pre: new Map(),
        post: new Map(),
        modules: new Map(),
      };
    }

    this._lastNumModifiedFiles =
      deltaBundle.pre.size + deltaBundle.post.size + deltaBundle.delta.size;

    if (this._lastNumModifiedFiles > 0) {
      this._lastModifiedDate = new Date();
    }

    this._patchMap(this._lastBundle.pre, deltaBundle.pre);
    this._patchMap(this._lastBundle.post, deltaBundle.post);
    this._patchMap(this._lastBundle.modules, deltaBundle.delta);

    return this;
  }

  /**
   * Returns the number of modified files in the last received Delta. This is
   * currently used to populate the `X-Metro-Files-Changed-Count` HTTP header
   * when metro serves the whole JS bundle, and can potentially be removed once
   * we only send the actual deltas to clients.
   */
  getLastNumModifiedFiles(): number {
    return this._lastNumModifiedFiles;
  }

  getLastModifiedDate(): Date {
    return this._lastModifiedDate;
  }

  /**
   * Converts the current delta bundle to a standard string bundle, ready to
   * be interpreted by any JS VM.
   */
  stringifyCode(): string {
    const code = this._getAllModules().map(m => m.code);

    return code.join('\n;');
  }

  stringifyMap({excludeSource}: {excludeSource?: boolean}): string {
    const mappings = fromRawMappings(this._getAllModules());

    return mappings.toString(undefined, {excludeSource});
  }

  _getAllModules() {
    return [].concat(
      Array.from(this._lastBundle.pre.values()),
      Array.from(this._lastBundle.modules.values()),
      Array.from(this._lastBundle.post.values()),
    );
  }

  _patchMap<K, V>(original: Map<K, V>, patch: Map<K, ?V>) {
    for (const [key, value] of patch.entries()) {
      if (value == null) {
        original.delete(key);
      } else {
        original.set(key, value);
      }
    }
  }
}

module.exports = DeltaPatcher;
