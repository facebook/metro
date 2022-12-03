/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 */

import {copyContextToObject} from './utils';
import type {RequireWithContext} from './utils';

declare var require: RequireWithContext;

function main(): mixed {
  return copyContextToObject(
    require.context('./subdir', undefined, undefined, 'sync'),
  );
}

module.exports = (main(): mixed);
