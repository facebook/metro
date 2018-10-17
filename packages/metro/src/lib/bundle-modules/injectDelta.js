/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */
'use strict';

import type {DeltaModuleMap} from './types.flow';

function injectDelta(modules: DeltaModuleMap) {
  modules.forEach(([id, code], i) => {
    // TODO(T34661038): This used to support source maps, but I've
    // removed the corresponding code for now since the HmrServer
    // does not generate source maps.

    // In JSC we need to inject from native for sourcemaps to work
    // (Safari doesn't support `sourceMappingURL` nor any variant when
    // evaluating code) but on Chrome we can simply use eval.
    const injectFunction =
      typeof global.nativeInjectHMRUpdate === 'function'
        ? global.nativeInjectHMRUpdate
        : eval; // eslint-disable-line no-eval

    injectFunction(code);
  });
}

module.exports = injectDelta;
