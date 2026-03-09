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

import type {EventEmitter} from 'events';

export type FileEntry =
  | string
  | [string, {isSymlink?: boolean, modifiedTime?: number}];

export type ChangeEventInput = {
  addedFiles?: ReadonlyArray<FileEntry>,
  modifiedFiles?: ReadonlyArray<FileEntry>,
  removedFiles?: ReadonlyArray<FileEntry>,
};

/**
 * Creates an emitChange helper function for DeltaCalculator tests.
 * The helper emits change events with canonical paths relative to rootDir.
 */
export function createEmitChange(
  fileWatcher: EventEmitter,
  rootDir: string,
  pathSeparator: string = '/',
): (changes: ChangeEventInput) => void {
  return function emitChange(changes: ChangeEventInput): void {
    const toEntry = (
      entry: FileEntry,
    ): [string, {modifiedTime: ?number, isSymlink: boolean}] => {
      const [file, opts] = typeof entry === 'string' ? [entry, {}] : entry;
      // Convert forward slashes to platform-specific separators for canonical paths
      const canonicalPath =
        pathSeparator !== '/' ? file.replaceAll('/', '\\') : file;
      return [
        canonicalPath,
        {
          modifiedTime: opts.modifiedTime ?? Date.now(),
          isSymlink: opts.isSymlink ?? false,
        },
      ];
    };
    fileWatcher.emit('change', {
      changes: {
        addedFiles: (changes.addedFiles ?? []).map(toEntry),
        modifiedFiles: (changes.modifiedFiles ?? []).map(toEntry),
        removedFiles: (changes.removedFiles ?? []).map(toEntry),
        addedDirectories: [],
        removedDirectories: [],
      },
      rootDir,
      logger: null,
    });
  };
}
