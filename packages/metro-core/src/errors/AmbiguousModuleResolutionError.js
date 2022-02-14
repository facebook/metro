/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

import {ModuleMap} from 'jest-haste-map';
const {DuplicateHasteCandidatesError} = ModuleMap;

class AmbiguousModuleResolutionError extends Error {
  fromModulePath: string;
  // $FlowFixMe[value-as-type]
  hasteError: DuplicateHasteCandidatesError;

  constructor(
    fromModulePath: string,
    // $FlowFixMe[value-as-type]
    hasteError: DuplicateHasteCandidatesError,
  ) {
    super(
      `Ambiguous module resolution from \`${fromModulePath}\`: ` +
        hasteError.message,
    );
    this.fromModulePath = fromModulePath;
    this.hasteError = hasteError;
  }
}

module.exports = AmbiguousModuleResolutionError;
