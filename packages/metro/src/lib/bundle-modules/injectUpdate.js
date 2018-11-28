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

import type {HmrUpdate, ModuleMap} from './types.flow';

function injectModules(
  modules: ModuleMap,
  sourceMappingURLs: $ReadOnlyArray<string>,
  sourceURLs: $ReadOnlyArray<string>,
) {
  modules.forEach(([id, code], i) => {
    // In JSC we need to inject from native for sourcemaps to work
    // (Safari doesn't support `sourceMappingURL` nor any variant when
    // evaluating code) but on Chrome we can simply use eval.
    const injectFunction =
      typeof global.nativeInjectHMRUpdate === 'function'
        ? global.nativeInjectHMRUpdate
        : eval; // eslint-disable-line no-eval

    // Fool regular expressions trying to remove sourceMappingURL comments from
    // source files, which would incorrectly detect and remove the inlined
    // version.
    const pragma = 'sourceMappingURL';
    injectFunction(
      code + `\n//# ${pragma}=${sourceMappingURLs[i]}`,
      sourceURLs[i],
    );
  });
}

function injectUpdate(update: HmrUpdate) {
  injectModules(
    update.added,
    update.addedSourceMappingURLs,
    update.addedSourceURLs,
  );
  injectModules(
    update.modified,
    update.modifiedSourceMappingURLs,
    update.modifiedSourceURLs,
  );
}

module.exports = injectUpdate;
