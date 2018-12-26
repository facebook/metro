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
  +pre: string,
  +post: string,
  +modules: ModuleMap,
|};

export type DeltaBundle = {|
  +added: ModuleMap,
  +modified: ModuleMap,
  +deleted: $ReadOnlyArray<number>,
|};

export type BundleVariant =
  | {|+base: true, +revisionId: string, ...Bundle|}
  | {|+base: false, +revisionId: string, ...DeltaBundle|};

export type BundleMetadata = {|
  +pre: number,
  +post: number,
  +modules: $ReadOnlyArray<[number, number]>,
|};

export type FormattedError = {|
  +type: string,
  +message: string,
  +errors: Array<{description: string}>,
|};

export type HmrUpdate = {|
  ...DeltaBundle,
  +revisionId: string,
  +addedSourceMappingURLs: $ReadOnlyArray<string>,
  +addedSourceURLs: $ReadOnlyArray<string>,
  +modifiedSourceMappingURLs: $ReadOnlyArray<string>,
  +modifiedSourceURLs: $ReadOnlyArray<string>,
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
