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

'use strict';

import type {FileAndDirCandidates} from '../types';

const formatFileCandidates = require('./formatFileCandidates');

class FailedToResolvePathError extends Error {
  candidates: FileAndDirCandidates;

  constructor(candidates: FileAndDirCandidates) {
    super(
      'The module could not be resolved because none of these files exist:\n\n' +
        `  * ${formatFileCandidates(candidates.file)}\n` +
        `  * ${formatFileCandidates(candidates.dir)}`,
    );
    this.candidates = candidates;
  }
}

module.exports = FailedToResolvePathError;
