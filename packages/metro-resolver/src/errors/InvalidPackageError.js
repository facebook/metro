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

import type {FileCandidates} from '../types';

const formatFileCandidates = require('./formatFileCandidates');

class InvalidPackageError extends Error {
  /**
   * The file candidates we tried to find to resolve the `main` field of the
   * package. Ex. `/js/foo/beep(.js|.json)?` if `main` is specifying `./beep`
   * as the entry point.
   */
  fileCandidates: FileCandidates;
  /**
   * The 'index' file candidates we tried to find to resolve the `main` field of
   * the package. Ex. `/js/foo/beep/index(.js|.json)?` if `main` is specifying
   * `./beep` as the entry point.
   */
  indexCandidates: FileCandidates;
  /**
   * The full path to the main module that was attempted.
   */
  mainModulePath: string;
  /**
   * Full path the package we were trying to resolve.
   * Ex. `/js/foo/package.json`.
   */
  packageJsonPath: string;

  constructor(opts: {
    +fileCandidates: FileCandidates,
    +indexCandidates: FileCandidates,
    +mainModulePath: string,
    +packageJsonPath: string,
  }) {
    super(
      `The package \`${opts.packageJsonPath}\` is invalid because it ` +
        'specifies a `main` module field that could not be resolved (' +
        `\`${opts.mainModulePath}\`. None of these files exist:\n\n` +
        `  * ${formatFileCandidates(opts.fileCandidates)}\n` +
        `  * ${formatFileCandidates(opts.indexCandidates)}`,
    );
    Object.assign(this, opts);
  }
}

module.exports = InvalidPackageError;
