/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {MinifierOptions, MinifierResult} from 'metro-transform-worker';

declare function minifier(options: MinifierOptions): Promise<MinifierResult>;
export default minifier;
