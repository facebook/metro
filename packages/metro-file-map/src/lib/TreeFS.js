/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 */

import type {
  FileData,
  FileMetaData,
  FileStats,
  MutableFileSystem,
  Path,
} from '../flow-types';

import H from '../constants';
import * as fastPath from '../lib/fast_path';
import invariant from 'invariant';
import path from 'path';

type DirectoryNode = Map<string, AnyNode>;
type FileNode = FileMetaData;
type LinkNode = string;
type AnyNode = FileNode | DirectoryNode | LinkNode;

export default class TreeFS implements MutableFileSystem {
  +#rootDir: Path;
  +#files: FileData;
  +#rootNode: DirectoryNode = new Map();

  constructor({rootDir, files}: {rootDir: Path, files: FileData}) {
    this.#rootDir = rootDir;
    this.#files = files;
    this.bulkAddOrModify(files);
  }

  getSerializableSnapshot(): FileData {
    return new Map(
      Array.from(this.#files.entries(), ([k, v]: [Path, FileMetaData]) => [
        k,
        [...v],
      ]),
    );
  }

  getModuleName(file: Path): ?string {
    const fileMetadata = this._getFileData(file);
    return (fileMetadata && fileMetadata[H.ID]) ?? null;
  }

  getSize(file: Path): ?number {
    const fileMetadata = this._getFileData(file);
    return (fileMetadata && fileMetadata[H.SIZE]) ?? null;
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
    const result = this._getFileData(file);
    return result != null;
  }

  getAllFiles(): Array<Path> {
    return Array.from(this._regularFileIterator(), normalPath =>
      this._normalToAbsolutePath(normalPath),
    );
  }

  linkStats(file: Path): ?FileStats {
    const fileMetadata = this._getFileData(file, {follow: false});
    if (fileMetadata == null) {
      return null;
    }
    const fileType = fileMetadata[H.SYMLINK] === 0 ? 'f' : 'l';
    const modifiedTime = fileMetadata[H.MTIME];
    invariant(
      typeof modifiedTime === 'number',
      'File in TreeFS missing modified time',
    );
    return {
      fileType,
      modifiedTime,
    };
  }

  matchFiles(pattern: RegExp | string): Array<Path> {
    const regexpPattern =
      pattern instanceof RegExp ? pattern : new RegExp(pattern);
    const files = [];
    for (const filePath of this._pathIterator()) {
      const absolutePath = this._normalToAbsolutePath(filePath);
      if (regexpPattern.test(absolutePath)) {
        files.push(absolutePath);
      }
    }
    return files;
  }

  /**
   * Given a search context, return a list of file paths matching the query.
   * The query matches against normalized paths which start with `./`,
   * for example: `a/b.js` -> `./a/b.js`
   */
  matchFilesWithContext(
    root: Path,
    context: $ReadOnly<{
      /* Should search for files recursively. */
      recursive: boolean,
      /* Filter relative paths against a pattern. */
      filter: RegExp,
    }>,
  ): Array<Path> {
    const normalRoot = this._normalizePath(root);
    const contextRootResult = this._lookupByNormalPath(normalRoot);
    if (!contextRootResult) {
      return [];
    }
    const {normalPath: rootRealPath, node: contextRoot} = contextRootResult;
    if (!(contextRoot instanceof Map)) {
      return [];
    }
    const contextRootAbsolutePath =
      rootRealPath === ''
        ? this.#rootDir
        : path.join(this.#rootDir, rootRealPath);

    const files = [];
    const prefix = './';

    for (const relativePosixPath of this._pathIterator({
      pathSep: '/',
      recursive: context.recursive,
      rootNode: contextRoot,
      subtreeOnly: true,
    })) {
      if (
        context.filter.test(
          // NOTE(EvanBacon): Ensure files start with `./` for matching purposes
          // this ensures packages work across Metro and Webpack (ex: Storybook for React DOM / React Native).
          // `a/b.js` -> `./a/b.js`
          prefix + relativePosixPath,
        )
      ) {
        const relativePath =
          path.sep === '/'
            ? relativePosixPath
            : relativePosixPath.replaceAll('/', path.sep);

        files.push(contextRootAbsolutePath + path.sep + relativePath);
      }
    }

    return files;
  }

  getRealPath(filePath: Path): ?string {
    const normalPath = this._normalizePath(filePath);
    const metadata = this.#files.get(normalPath);
    if (metadata && metadata[H.SYMLINK] === 0) {
      return fastPath.resolve(this.#rootDir, normalPath);
    }
    const result = this._lookupByNormalPath(normalPath, {follow: true});
    if (!result || result.node instanceof Map) {
      return null;
    }
    return fastPath.resolve(this.#rootDir, result.normalPath);
  }

  addOrModify(filePath: Path, metadata: FileMetaData): void {
    const normalPath = this._normalizePath(filePath);
    this.bulkAddOrModify(new Map([[normalPath, metadata]]));
  }

  bulkAddOrModify(addedOrModifiedFiles: FileData): void {
    for (const [normalPath, metadata] of addedOrModifiedFiles) {
      this.#files.set(normalPath, metadata);
      const directoryParts = normalPath.split(path.sep);
      const basename = directoryParts.pop();
      const directoryNode = this._mkdirp(directoryParts);
      if (metadata[H.SYMLINK] !== 0) {
        const symlinkTarget = metadata[H.SYMLINK];
        invariant(
          typeof symlinkTarget === 'string',
          'expected symlink targets to be populated',
        );
        let rootRelativeSymlinkTarget;
        if (path.isAbsolute(symlinkTarget)) {
          rootRelativeSymlinkTarget = fastPath.relative(
            this.#rootDir,
            symlinkTarget,
          );
        } else {
          rootRelativeSymlinkTarget = path.normalize(
            path.join(path.dirname(normalPath), symlinkTarget),
          );
        }
        directoryNode.set(basename, rootRelativeSymlinkTarget);
      } else {
        directoryNode.set(basename, metadata);
      }
    }
  }

  remove(filePath: Path): ?FileMetaData {
    const normalPath = this._normalizePath(filePath);
    const fileMetadata = this.#files.get(normalPath);
    if (fileMetadata == null) {
      return null;
    }
    this.#files.delete(normalPath);
    const directoryParts = normalPath.split(path.sep);
    const basename = directoryParts.pop();
    const directoryNode = this._mkdirp(directoryParts);
    directoryNode.delete(basename);
    return fileMetadata;
  }

  _lookupByNormalPath(
    relativePath: string,
    opts: {
      // Like lstat vs stat, whether to follow a symlink at the basename of
      // the given path, or return the details of the symlink itself.
      follow: boolean,
    } = {follow: true},
    seen: Set<string> = new Set(),
  ): ?{normalPath: string, node: AnyNode} {
    if (relativePath === '') {
      return {normalPath: '', node: this.#rootNode};
    }
    seen.add(relativePath);
    const directoryParts = relativePath.split(path.sep);
    const basename = directoryParts.pop();
    let node = this.#rootNode;
    for (const [idx, directoryPart] of directoryParts.entries()) {
      if (directoryPart === '.') {
        continue;
      }
      const nextNode = node.get(directoryPart);
      if (nextNode == null) {
        return null;
      }
      if (Array.isArray(nextNode)) {
        // Regular file in a directory path
        return null;
      } else if (typeof nextNode === 'string') {
        if (seen.has(nextNode)) {
          // TODO: Warn `Symlink cycle detected: ${[...seen, node].join(' -> ')}`
          return null;
        }
        return this._lookupByNormalPath(
          path.join(nextNode, ...directoryParts.slice(idx + 1), basename),
          opts,
          seen,
        );
      }
      node = nextNode;
    }
    const basenameNode = node.get(basename);
    if (typeof basenameNode === 'string') {
      // basenameNode is a symlink target
      if (!opts.follow) {
        return {normalPath: relativePath, node: basenameNode};
      }
      if (seen.has(basenameNode)) {
        // TODO: Warn `Symlink cycle detected: ${[...seen, target].join(' -> ')}`
        return null;
      }
      return this._lookupByNormalPath(basenameNode, opts, seen);
    }
    return basenameNode ? {normalPath: relativePath, node: basenameNode} : null;
  }

  _normalizePath(relativeOrAbsolutePath: Path): string {
    return path.isAbsolute(relativeOrAbsolutePath)
      ? fastPath.relative(this.#rootDir, relativeOrAbsolutePath)
      : path.normalize(relativeOrAbsolutePath);
  }

  _normalToAbsolutePath(normalPath: Path): Path {
    if (normalPath[0] === '.') {
      return path.normalize(this.#rootDir + path.sep + normalPath);
    } else {
      return this.#rootDir + path.sep + normalPath;
    }
  }

  *_regularFileIterator(): Iterator<Path> {
    for (const [normalPath, metadata] of this.#files) {
      if (metadata[H.SYMLINK] !== 0) {
        continue;
      }
      yield normalPath;
    }
  }

  *_pathIterator({
    pathSep = path.sep,
    recursive = true,
    rootNode,
    subtreeOnly = false,
  }: {
    pathSep?: string,
    recursive?: boolean,
    rootNode?: DirectoryNode,
    subtreeOnly?: boolean,
  } = {}): Iterable<Path> {
    for (const [name, node] of rootNode ?? this.#rootNode) {
      if (subtreeOnly && name === '..') {
        continue;
      }
      if (Array.isArray(node)) {
        yield name;
      } else if (typeof node === 'string') {
        const resolved = this._lookupByNormalPath(node);
        if (resolved == null) {
          continue;
        }
        const target = resolved.node;
        if (target instanceof Map) {
          if (!recursive) {
            continue;
          }
          // symlink points to a directory - iterate over its contents
          for (const file of this._pathIterator({
            pathSep,
            recursive,
            rootNode: target,
            subtreeOnly,
          })) {
            yield name + pathSep + file;
          }
        } else {
          // symlink points to a file - report it
          yield name;
        }
      } else if (recursive) {
        for (const file of this._pathIterator({
          pathSep,
          recursive,
          rootNode: node,
          subtreeOnly,
        })) {
          yield name + pathSep + file;
        }
      }
    }
  }

  _getFileData(
    filePath: Path,
    opts: {follow: boolean} = {follow: true},
  ): ?FileMetaData {
    const normalPath = this._normalizePath(filePath);
    const metadata = this.#files.get(normalPath);
    if (metadata && (!opts.follow || metadata[H.SYMLINK] === 0)) {
      return metadata;
    }
    const result = this._lookupByNormalPath(normalPath, opts);
    if (!result || result.node instanceof Map) {
      return null;
    }
    return this.#files.get(result.normalPath);
  }

  _mkdirp(directoryParts: $ReadOnlyArray<string>): DirectoryNode {
    let node = this.#rootNode;
    for (const directoryPart of directoryParts) {
      if (directoryPart === '.') {
        continue;
      }
      let nextNode = node.get(directoryPart);
      if (nextNode == null) {
        nextNode = new Map();
        node.set(directoryPart, nextNode);
      }
      invariant(
        nextNode instanceof Map,
        '%s in %s is a file, directory expected',
        directoryPart,
        directoryParts,
      );
      node = nextNode;
    }
    return node;
  }
}
