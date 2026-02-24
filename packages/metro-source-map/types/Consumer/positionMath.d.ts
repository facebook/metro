/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<6db8c7c1cbb86a47de92e1b9565dd624>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-source-map/src/Consumer/positionMath.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
