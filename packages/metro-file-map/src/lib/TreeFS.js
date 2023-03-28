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

// Terminology:
//
// mixedPath - a root-relative or absolute path
// relativePath - a root-relative path
// normalPath - a root-relative, normalised path (no extraneous '.' or '..')
// canonicalPath - a root-relative, normalised, real path (no symlinks in dirname)

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

  getModuleName(mixedPath: Path): ?string {
    const fileMetadata = this._getFileData(mixedPath);
    return (fileMetadata && fileMetadata[H.ID]) ?? null;
  }

  getSize(mixedPath: Path): ?number {
    const fileMetadata = this._getFileData(mixedPath);
    return (fileMetadata && fileMetadata[H.SIZE]) ?? null;
  }

  getDependencies(mixedPath: Path): ?Array<string> {
    const fileMetadata = this._getFileData(mixedPath);

    if (fileMetadata) {
      return fileMetadata[H.DEPENDENCIES]
        ? fileMetadata[H.DEPENDENCIES].split(H.DEPENDENCY_DELIM)
        : [];
    } else {
      return null;
    }
  }

  getSha1(mixedPath: Path): ?string {
    const fileMetadata = this._getFileData(mixedPath);
    return (fileMetadata && fileMetadata[H.SHA1]) ?? null;
  }

  exists(mixedPath: Path): boolean {
    const result = this._getFileData(mixedPath);
    return result != null;
  }

  getAllFiles(): Array<Path> {
    return Array.from(this._regularFileIterator(), normalPath =>
      this._normalToAbsolutePath(normalPath),
    );
  }

  linkStats(mixedPath: Path): ?FileStats {
    const fileMetadata = this._getFileData(mixedPath, {followLeaf: false});
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
    const {canonicalPath: rootRealPath, node: contextRoot} = contextRootResult;
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

  getRealPath(mixedPath: Path): ?string {
    const normalPath = this._normalizePath(mixedPath);
    const metadata = this.#files.get(normalPath);
    if (metadata && metadata[H.SYMLINK] === 0) {
      return fastPath.resolve(this.#rootDir, normalPath);
    }
    const result = this._lookupByNormalPath(normalPath, {followLeaf: true});
    if (!result || result.node instanceof Map) {
      return null;
    }
    return fastPath.resolve(this.#rootDir, result.canonicalPath);
  }

  addOrModify(mixedPath: Path, metadata: FileMetaData): void {
    const normalPath = this._normalizePath(mixedPath);
    // Walk the tree to find the *real* path of the parent node, creating
    // directories as we need.
    const parentDirNode = this._lookupByNormalPath(path.dirname(normalPath), {
      makeDirectories: true,
    });
    if (!parentDirNode) {
      throw new Error(
        `TreeFS: Failed to make parent directory entry for ${mixedPath}`,
      );
    }
    // Normalize the resulting path to account for the parent node being root.
    const canonicalPath = this._normalizePath(
      parentDirNode.canonicalPath + path.sep + path.basename(normalPath),
    );
    this.bulkAddOrModify(new Map([[canonicalPath, metadata]]));
  }

  bulkAddOrModify(addedOrModifiedFiles: FileData): void {
    const files = this.#files;

    // Optimisation: Bulk FileData are typically clustered by directory, so we
    // optimise for that case by remembering the last directory we looked up.
    // Experiments with large result sets show this to be significantly (~30%)
    // faster than caching all lookups in a Map, and 70% faster than no cache.
    let lastDir: ?string;
    let directoryNode: DirectoryNode;

    for (const [normalPath, metadata] of addedOrModifiedFiles) {
      if (addedOrModifiedFiles !== files) {
        files.set(normalPath, metadata);
      }

      const lastSepIdx = normalPath.lastIndexOf(path.sep);
      const dirname = lastSepIdx === -1 ? '' : normalPath.slice(0, lastSepIdx);
      const basename =
        lastSepIdx === -1 ? normalPath : normalPath.slice(lastSepIdx + 1);

      if (directoryNode == null || dirname !== lastDir) {
        const lookup = this._lookupByNormalPath(dirname, {
          followLeaf: false,
          makeDirectories: true,
        });
        if (!(lookup?.node instanceof Map)) {
          throw new Error(
            `TreeFS: Could not add directory ${dirname} when adding files`,
          );
        }
        lastDir = dirname;
        directoryNode = lookup.node;
      }

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

  remove(mixedPath: Path): ?FileMetaData {
    const normalPath = this._normalizePath(mixedPath);
    const result = this._lookupByNormalPath(normalPath, {followLeaf: false});
    if (!result || result.node instanceof Map) {
      return null;
    }
    const {parentNode, canonicalPath, node} = result;

    // If node is a symlink, get its metadata from the file map. Otherwise, we
    // already have it in the lookup result.
    const fileMetadata =
      typeof node === 'string' ? this.#files.get(canonicalPath) : node;
    if (fileMetadata == null) {
      throw new Error(`TreeFS: Missing metadata for ${mixedPath}`);
    }
    if (parentNode == null) {
      throw new Error(`TreeFS: Missing parent node for ${mixedPath}`);
    }
    this.#files.delete(canonicalPath);
    parentNode.delete(path.basename(canonicalPath));
    return fileMetadata;
  }

  _lookupByNormalPath(
    requestedNormalPath: string,
    opts: {
      // Like lstat vs stat, whether to follow a symlink at the basename of
      // the given path, or return the details of the symlink itself.
      followLeaf?: boolean,
      makeDirectories?: boolean,
    } = {followLeaf: true, makeDirectories: false},
  ): ?(
    | {canonicalPath: string, node: AnyNode, parentNode: DirectoryNode}
    | {canonicalPath: string, node: DirectoryNode, parentNode: null}
  ) {
    // We'll update the target if we hit a symlink.
    let targetNormalPath = requestedNormalPath;
    // Lazy-initialised set of seen target paths, to detect symlink cycles.
    let seen: ?Set<string>;
    // Pointer to the first character of the current path segment in
    // targetNormalPath.
    let fromIdx = 0;
    // The parent of the current segment
    let parentNode = this.#rootNode;

    while (targetNormalPath.length > fromIdx) {
      const nextSepIdx = targetNormalPath.indexOf(path.sep, fromIdx);
      const isLastSegment = nextSepIdx === -1;
      const segmentName = isLastSegment
        ? targetNormalPath.slice(fromIdx)
        : targetNormalPath.slice(fromIdx, nextSepIdx);
      fromIdx = !isLastSegment ? nextSepIdx + 1 : targetNormalPath.length;

      if (segmentName === '.') {
        continue;
      }

      let segmentNode = parentNode.get(segmentName);
      if (segmentNode == null) {
        if (opts.makeDirectories !== true) {
          return null;
        }
        segmentNode = new Map();
        parentNode.set(segmentName, segmentNode);
      }

      // If there are no more '/' to come, we're done unless this is a symlink
      // we must follow.
      if (
        isLastSegment &&
        (typeof segmentNode !== 'string' || opts.followLeaf === false)
      ) {
        return {
          canonicalPath: targetNormalPath,
          node: segmentNode,
          parentNode,
        };
      }

      // If the next node is a directory, go into it
      if (segmentNode instanceof Map) {
        parentNode = segmentNode;
      } else if (Array.isArray(segmentNode)) {
        // Regular file in a directory path
        return null;
      } else if (typeof segmentNode === 'string') {
        // segmentNode is a normalised symlink target. Append any subsequent
        // path segments to the symlink target, and reset with our new target.
        targetNormalPath = isLastSegment
          ? segmentNode
          : segmentNode + path.sep + targetNormalPath.slice(fromIdx);
        if (seen == null) {
          // Optimisation: set this lazily only when we've encountered a symlink
          seen = new Set([requestedNormalPath]);
        }
        if (seen.has(targetNormalPath)) {
          // TODO: Warn `Symlink cycle detected: ${[...seen, node].join(' -> ')}`
          return null;
        }
        seen.add(targetNormalPath);
        fromIdx = 0;
        parentNode = this.#rootNode;
      }
    }
    invariant(parentNode === this.#rootNode, 'Unexpectedly escaped traversal');
    return {
      canonicalPath: targetNormalPath,
      node: this.#rootNode,
      parentNode: null,
    };
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
    opts: {followLeaf: boolean} = {followLeaf: true},
  ): ?FileMetaData {
    const normalPath = this._normalizePath(filePath);
    const metadata = this.#files.get(normalPath);
    if (metadata && (!opts.followLeaf || metadata[H.SYMLINK] === 0)) {
      return metadata;
    }
    const result = this._lookupByNormalPath(normalPath, {
      followLeaf: opts.followLeaf,
    });
    if (!result || result.node instanceof Map) {
      return null;
    }
    return this.#files.get(result.canonicalPath);
  }
}
