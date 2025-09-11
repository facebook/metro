/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {GeneratedOffset} from './types';
import type {Number0, Number1} from 'ob1';

export declare function shiftPositionByOffset<
  T extends {
    readonly line: null | undefined | Number1;
    readonly column: null | undefined | Number0;
  },
>(pos: T, offset: GeneratedOffset): T;
export declare function subtractOffsetFromPosition<
  T extends {
    readonly line: null | undefined | Number1;
    readonly column: null | undefined | Number0;
  },
>(pos: T, offset: GeneratedOffset): T;
