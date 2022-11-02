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

/**
 * Originally vendored from
 * https://github.com/amasad/sane/blob/64ff3a870c42e84f744086884bf55a4f9c22d376/src/common.js
 */

'use strict';

import type {Stats} from 'fs';

// $FlowFixMe[untyped-import] - Write libdefs for `anymatch`
const anymatch = require('anymatch');
// $FlowFixMe[untyped-import] - Write libdefs for `micromatch`
const micromatch = require('micromatch');
const platform = require('os').platform();
const path = require('path');
// $FlowFixMe[untyped-import] - Write libdefs for `walker`
const walker = require('walker');

/**
 * Constants
 */
export const DEFAULT_DELAY = 100;
export const CHANGE_EVENT = 'change';
export const DELETE_EVENT = 'delete';
export const ADD_EVENT = 'add';
export const ALL_EVENT = 'all';

export type WatcherOptions = $ReadOnly<{
  glob: $ReadOnlyArray<string>,
  dot: boolean,
  ignored: boolean | RegExp,
  watchmanDeferStates: $ReadOnlyArray<string>,
  watchman?: mixed,
  watchmanPath?: string,
}>;

interface Watcher {
  doIgnore: string => boolean;
  dot: boolean;
  globs: $ReadOnlyArray<string>;
  hasIgnore: boolean;
  ignored?: ?(boolean | RegExp);
  watchmanDeferStates: $ReadOnlyArray<string>;
  watchmanPath?: ?string;
}

/**
 * Assigns options to the watcher.
 *
 * @param {NodeWatcher|PollWatcher|WatchmanWatcher} watcher
 * @param {?object} opts
 * @return {boolean}
 * @public
 */
export const assignOptions = function (
  watcher: Watcher,
  opts: WatcherOptions,
): WatcherOptions {
  watcher.globs = opts.glob ?? [];
  watcher.dot = opts.dot ?? false;
  watcher.ignored = opts.ignored ?? false;
  watcher.watchmanDeferStates = opts.watchmanDeferStates;

  if (!Array.isArray(watcher.globs)) {
    watcher.globs = [watcher.globs];
  }
  watcher.hasIgnore =
    Boolean(opts.ignored) && !(Array.isArray(opts) && opts.length > 0);
  watcher.doIgnore =
    opts.ignored != null && opts.ignored !== false
      ? anymatch(opts.ignored)
      : () => false;

  if (opts.watchman == true && opts.watchmanPath != null) {
    watcher.watchmanPath = opts.watchmanPath;
  }

  return opts;
};

/**
 * Checks a file relative path against the globs array.
 */
export function isFileIncluded(
  globs: $ReadOnlyArray<string>,
  dot: boolean,
  doIgnore: string => boolean,
  relativePath: string,
): boolean {
  if (doIgnore(relativePath)) {
    return false;
  }
  return globs.length
    ? micromatch.some(relativePath, globs, {dot})
    : dot || micromatch.some(relativePath, '**/*');
}

/**
 * Traverse a directory recursively calling `callback` on every directory.
 */
export function recReaddir(
  dir: string,
  dirCallback: (string, Stats) => void,
  fileCallback: (string, Stats) => void,
  endCallback: () => void,
  errorCallback: Error => void,
  ignored: ?(boolean | RegExp),
) {
  walker(dir)
    .filterDir(currentDir => !anymatch(ignored, currentDir))
    .on('dir', normalizeProxy(dirCallback))
    .on('file', normalizeProxy(fileCallback))
    .on('error', errorCallback)
    .on('end', () => {
      if (platform === 'win32') {
        setTimeout(endCallback, 1000);
      } else {
        endCallback();
      }
    });
}

/**
 * Returns a callback that when called will normalize a path and call the
 * original callback
 */
function normalizeProxy<T>(
  callback: (filepath: string, stats: Stats) => T,
): (string, Stats) => T {
  return (filepath: string, stats: Stats) =>
    callback(path.normalize(filepath), stats);
}
