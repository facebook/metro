/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

/*::
import type {InputConfigT} from '../types';
*/

module.exports = {
  cacheStores: ({FileStore}) => {
    return [new FileStore({root: __dirname})];
  },
} /*:: as InputConfigT*/;
