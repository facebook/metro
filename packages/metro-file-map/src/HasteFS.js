/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 */

import type {FileData, Path} from './flow-types';

import H from './constants';
import * as fastPath from './lib/fast_path';
// $FlowFixMe[untyped-import] - jest-util
import {globsToMatcher, replacePathSepForGlob} from 'jest-util';

// $FlowFixMe[unclear-type] - Check TS Config.Glob
type Glob = any;

export default class HasteFS {
  +_rootDir: Path;
  +_files: FileData;

  constructor({rootDir, files}: {rootDir: Path, files: FileData}) {
    this._rootDir = rootDir;
    this._files = files;
  }

  getModuleName(file: Path): ?string {
    const fileMetadata = this._getFileData(file);
    return (fileMetadata && fileMetadata[H.ID]) || null;
  }

  getSize(file: Path): ?number {
    const fileMetadata = this._getFileData(file);
    return (fileMetadata && fileMetadata[H.SIZE]) || null;
  }

  getDependencies(file: Path): ?Array<string> {
    const fileMetadata = this._getFileData(file);

    if (fileMetadata) {
      return fileMetadata[H.DEPENDENCIES]
        ? fileMetadata[H.DEPENDENCIES].split(H.DEPENDENCY_DELIM)
        : [];
    } else {
      return null;
    }
  }

  getSha1(file: Path): ?string {
    const fileMetadata = this._getFileData(file);
    return (fileMetadata && fileMetadata[H.SHA1]) ?? null;
  }

  exists(file: Path): boolean {
    return this._getFileData(file) != null;
  }

  getAllFiles(): Array<Path> {
    return Array.from(this.getAbsoluteFileIterator());
  }

  getFileIterator(): Iterable<Path> {
    return this._files.keys();
  }

  *getAbsoluteFileIterator(): Iterable<Path> {
    for (const file of this.getFileIterator()) {
      yield fastPath.resolve(this._rootDir, file);
    }
  }

  matchFiles(pattern: RegExp | string): Array<Path> {
    const regexpPattern =
      pattern instanceof RegExp ? pattern : new RegExp(pattern);
    const files = [];
    for (const file of this.getAbsoluteFileIterator()) {
      if (regexpPattern.test(file)) {
        files.push(file);
      }
    }
    return files;
  }

  matchFilesWithGlob(globs: $ReadOnlyArray<Glob>, root: ?Path): Set<Path> {
    const files = new Set<string>();
    const matcher = globsToMatcher(globs);

    for (const file of this.getAbsoluteFileIterator()) {
      const filePath = root != null ? fastPath.relative(root, file) : file;
      if (matcher(replacePathSepForGlob(filePath))) {
        files.add(file);
      }
    }
    return files;
  }

  _getFileData(file: Path) {
    const relativePath = fastPath.relative(this._rootDir, file);
    return this._files.get(relativePath);
  }
}
