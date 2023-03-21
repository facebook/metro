/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import {existsSync} from 'fs';
import {join} from 'path';

if (existsSync(join(__dirname, 'metro-swc-transformer-addon.node'))) {
  throw new Error('Node.js addon for metro-swc-transformer not found');
}

export {default} from './metro-swc-transformer-addon';
