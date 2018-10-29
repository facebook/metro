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

export type ModuleMap = $ReadOnlyArray<[number, string]>;

export type Bundle = {|
  +base: true,
  +revisionId: string,
  +pre: string,
  +post: string,
  +modules: ModuleMap,
|};

export type DeltaBundle = {|
  +base: false,
  +revisionId: string,
  +modules: ModuleMap,
  +deleted: $ReadOnlyArray<number>,
|};

export type FormattedError = {|
  +type: string,
  +message: string,
  +errors: Array<{description: string}>,
|};

export type HmrUpdate = {|
  +revisionId: string,
  +modules: ModuleMap,
  +deleted: $ReadOnlyArray<number>,
  +sourceMappingURLs: $ReadOnlyArray<string>,
  +sourceURLs: $ReadOnlyArray<string>,
|};

export type HmrUpdateMessage = {|
  +type: 'update',
  +body: HmrUpdate,
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
