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

import type {HmrUpdate} from './types.flow';

function injectUpdate(update: HmrUpdate): void {
  const sourceURLs = [...update.addedSourceURLs, ...update.modifiedSourceURLs];
  [...update.added, ...update.modified].forEach(([id, code], i: number) => {
    // Some engines do not support `sourceURL` as a comment. We expose a
    // `globalEvalWithSourceUrl` function to handle updates in that case.
    if (global.globalEvalWithSourceUrl) {
      global.globalEvalWithSourceUrl(code, sourceURLs[i]);
    } else {
      // eslint-disable-next-line no-eval
      eval(code);
    }
  });
}

module.exports = injectUpdate;
