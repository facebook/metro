/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

'use strict';

module.exports = function(declared: Object): (opts: any) => any {
  return function(opts: Object) {
    for (var p in declared) {
      if (opts[p] == null && declared[p].default != null) {
        opts[p] = declared[p].default;
      }
    }
    return opts;
  };
};
