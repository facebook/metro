/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

'use strict';

import type {FileAndDirCandidates} from '../types';

const formatFileCandidates = require('./formatFileCandidates');

class FailedToResolvePathError extends Error {
  candidates: FileAndDirCandidates;

  constructor(candidates: FileAndDirCandidates) {
    super(
      'The module could not be resolved because no file matched the pattern:\n\n' +
        `  * ${formatFileCandidates(candidates.file, true)}`,
    );
    this.candidates = candidates;
  }
}

module.exports = FailedToResolvePathError;
