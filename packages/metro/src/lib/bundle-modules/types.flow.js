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

export type FormattedError = {|
  +type: string,
  +message: string,
  +errors: Array<{description: string}>,
|};

export type HmrUpdateMessage = {|
  +type: 'update',
  +body: {|
    +id: string,
    +delta: DeltaModuleMap,
  |},
|};

export type HmrErrorMessage = {|
  +type: 'error',
  +body: FormattedError,
|};

export type HmrMessage =
  | {|
      +type: 'update-start',
    |}
  | {|
      +type: 'update-done',
    |}
  | HmrUpdateMessage
  | HmrErrorMessage;

// (id, code)
export type DeltaModuleEntry = [number, string | null];

export type DeltaModuleMap = $ReadOnlyArray<DeltaModuleEntry>;

export type DeltaBundle = {|
  +id: string,
  +pre: DeltaModuleMap,
  +post: DeltaModuleMap,
  +delta: DeltaModuleMap,
  +reset: boolean,
|};
