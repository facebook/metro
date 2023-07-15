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

import path from 'path';

import type {FileCandidates} from '../types';

function formatFileCandidates(
  candidates: FileCandidates,
  allowIndex: boolean = false,
): string {
  if (candidates.type === 'asset') {
    return candidates.name;
  }
  let formatted = candidates.filePathPrefix;

  if (allowIndex) {
    formatted += `(${path.sep}index)?`;
  }

  if (candidates.candidateExts.length) {
    const exts = candidates.candidateExts.filter(Boolean);
    // exts are formatted as `.ios.js, .native.js, .js, .native.json, .json`
    // we want to split them into groups delimited by the period, then format
    // like `(.native|.ios).(js|json)`

    // split into groups, filter, reverse to ensure we get the most specific
    const groups = exts.map(ext => ext.split('.').filter(Boolean).reverse());

    const splits = groups
      .reduce((acc, group) => {
        group.forEach((ext, i) => {
          if (!acc[i]) {
            acc[i] = [];
          }
          acc[i].push(ext);
        });
        return acc;
      }, [])
      // Remove duplicates
      .map(group => [...new Set(group)])
      .reverse();

    formatted += splits
      .map((split, index) => {
        return index < splits.length - 1
          ? `(${split.map(split => `.${split}`).join('|')})?`
          : `.(${split.join('|')})`;
      })
      .join('');
  }
  return formatted;
}

module.exports = formatFileCandidates;
