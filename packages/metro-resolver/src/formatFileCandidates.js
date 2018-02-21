/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

import type {FileCandidates} from './types';

function formatFileCandidates(candidates: FileCandidates): string {
  if (candidates.type === 'asset') {
    return candidates.name;
  }
  return `${candidates.filePathPrefix}(${candidates.candidateExts.join('|')})`;
}

module.exports = formatFileCandidates;
