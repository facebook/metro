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

import type {FileCandidates} from './types';

function formatFileCandidates(candidates: FileCandidates): string {
  if (candidates.type === 'asset') {
    return candidates.name;
  }
  let formatted = candidates.filePathPrefix;
  if (candidates.candidateExts.length) {
    formatted += '(' + candidates.candidateExts.filter(Boolean).join('|') + ')';
  }
  return formatted;
}

module.exports = formatFileCandidates;
