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
  CacheData,
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

type DirectoryNode = Map<string, MixedNode>;
type FileNode = FileMetaData;
type MixedNode = FileNode | DirectoryNode;

// Terminology:
//
// mixedPath - a root-relative or absolute path
// relativePath - a root-relative path
// normalPath - a root-relative, normalised path (no extraneous '.' or '..')
// canonicalPath - a root-relative, normalised, real path (no symlinks in dirname)

export default class TreeFS implements MutableFileSystem {
  +#cachedNormalSymlinkTargets: WeakMap<FileNode, Path> = new WeakMap();
  +#rootDir: Path;
  #rootNode: DirectoryNode = new Map();

  constructor({rootDir, files}: {rootDir: Path, files?: FileData}) {
    this.#rootDir = rootDir;
    if (files != null) {
      this.bulkAddOrModify(files);
    }
  }

  getSerializableSnapshot(): CacheData['fileSystemData'] {
    return this._cloneTree(this.#rootNode);
  }

  static fromDeserializedSnapshot({
    rootDir,
    fileSystemData,
  }: {
    rootDir: string,
    fileSystemData: DirectoryNode,
  }): TreeFS {
    const tfs = new TreeFS({rootDir});
    tfs.#rootNode = fileSystemData;
    return tfs;
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

  getDifference(files: FileData): {
    changedFiles: FileData,
    removedFiles: Set<string>,
  } {
    const changedFiles: FileData = new Map(files);
    const removedFiles: Set<string> = new Set();
    for (const {canonicalPath, metadata} of this.metadataIterator({
      includeSymlinks: true,
      includeNodeModules: true,
    })) {
      const newMetadata = files.get(canonicalPath);
      if (newMetadata) {
        if ((newMetadata[H.SYMLINK] === 0) !== (metadata[H.SYMLINK] === 0)) {
          // Types differ, file has changed
          continue;
        }
        if (
          newMetadata[H.MTIME] != null &&
          // TODO: Remove when mtime is null if not populated
          newMetadata[H.MTIME] != 0 &&
          newMetadata[H.MTIME] === metadata[H.MTIME]
        ) {
          // Types and modified time match - not changed.
          changedFiles.delete(canonicalPath);
        } else if (
          newMetadata[H.SHA1] != null &&
          newMetadata[H.SHA1] === metadata[H.SHA1] &&
          metadata[H.VISITED] === 1
        ) {
          // Content matches - update modified time but don't revisit
          const updatedMetadata = [...metadata];
          updatedMetadata[H.MTIME] = newMetadata[H.MTIME];
          changedFiles.set(canonicalPath, updatedMetadata);
        }
      } else {
        removedFiles.add(canonicalPath);
      }
    }
    return {
      changedFiles,
      removedFiles,
    };
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
    const rootDir = this.#rootDir;
    return Array.from(
      this.metadataIterator({
        includeSymlinks: false,
        includeNodeModules: true,
      }),
      ({canonicalPath}) => fastPath.resolve(rootDir, canonicalPath),
    );
  }

  linkStats(mixedPath: Path): ?FileStats {
    const fileMetadata = this._getFileData(mixedPath, {followLeaf: false});
    if (fileMetadata == null) {
      return null;
    }
    const fileType = fileMetadata[H.SYMLINK] === 0 ? 'f' : 'l';
    const modifiedTime = fileMetadata[H.MTIME];
    return {
      fileType,
      modifiedTime,
    };
  }

  /**
   * Given a search context, return a list of file paths matching the query.
   * The query matches against normalized paths which start with `./`,
   * for example: `a/b.js` -> `./a/b.js`
   */
  *matchFiles({
    filter = null,
    filterCompareAbsolute = false,
    filterComparePosix = false,
    follow = false,
    recursive = true,
    rootDir = null,
  }: $ReadOnly<{
    /* Filter relative paths against a pattern. */
    filter?: ?RegExp,
    /* `filter` is applied against absolute paths, vs rootDir-relative. (default: false) */
    filterCompareAbsolute?: boolean,
    /* `filter` is applied against posix-delimited paths, even on Windows. (default: false) */
    filterComparePosix?: boolean,
    /* Follow symlinks when enumerating paths. (default: false) */
    follow?: boolean,
    /* Should search for files recursively. (default: true) */
    recursive?: boolean,
    /* Match files under a given root, or null for all files */
    rootDir?: ?Path,
  }>): Iterable<Path> {
    const normalRoot = rootDir == null ? '' : this._normalizePath(rootDir);
    const contextRootResult = this._lookupByNormalPath(normalRoot);
    if (!contextRootResult) {
      return;
    }
    const {canonicalPath: rootRealPath, node: contextRoot} = contextRootResult;
    if (!(contextRoot instanceof Map)) {
      return;
    }
    const contextRootAbsolutePath =
      rootRealPath === ''
        ? this.#rootDir
        : path.join(this.#rootDir, rootRealPath);

    const prefix = filterComparePosix ? './' : '.' + path.sep;

    const contextRootAbsolutePathForComparison =
      filterComparePosix && path.sep !== '/'
        ? contextRootAbsolutePath.replaceAll(path.sep, '/')
        : contextRootAbsolutePath;

    for (const relativePathForComparison of this._pathIterator(contextRoot, {
      alwaysYieldPosix: filterComparePosix,
      canonicalPathOfRoot: rootRealPath,
      follow,
      recursive,
      subtreeOnly: rootDir != null,
    })) {
      if (
        filter == null ||
        filter.test(
          // NOTE(EvanBacon): Ensure files start with `./` for matching purposes
          // this ensures packages work across Metro and Webpack (ex: Storybook for React DOM / React Native).
          // `a/b.js` -> `./a/b.js`
          filterCompareAbsolute === true
            ? path.join(
                contextRootAbsolutePathForComparison,
                relativePathForComparison,
              )
            : prefix + relativePathForComparison,
        )
      ) {
        const relativePath =
          filterComparePosix === true && path.sep !== '/'
            ? relativePathForComparison.replaceAll('/', path.sep)
            : relativePathForComparison;

        yield path.join(contextRootAbsolutePath, relativePath);
      }
    }
  }

  getRealPath(mixedPath: Path): ?string {
    const normalPath = this._normalizePath(mixedPath);
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
    // Optimisation: Bulk FileData are typically clustered by directory, so we
    // optimise for that case by remembering the last directory we looked up.
    // Experiments with large result sets show this to be significantly (~30%)
    // faster than caching all lookups in a Map, and 70% faster than no cache.
    let lastDir: ?string;
    let directoryNode: DirectoryNode;

    for (const [normalPath, metadata] of addedOrModifiedFiles) {
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
      directoryNode.set(basename, metadata);
    }
  }

  remove(mixedPath: Path): ?FileMetaData {
    const normalPath = this._normalizePath(mixedPath);
    const result = this._lookupByNormalPath(normalPath, {followLeaf: false});
    if (!result) {
      return null;
    }
    const {parentNode, canonicalPath, node} = result;

    if (node instanceof Map) {
      throw new Error(`TreeFS: remove called on a directory: ${mixedPath}`);
    }
    // If node is a symlink, get its metadata from the tuple.
    const fileMetadata = node;
    if (fileMetadata == null) {
      throw new Error(`TreeFS: Missing metadata for ${mixedPath}`);
    }
    if (parentNode == null) {
      throw new Error(`TreeFS: Missing parent node for ${mixedPath}`);
    }
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
    | {canonicalPath: string, node: MixedNode, parentNode: DirectoryNode}
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
        (segmentNode instanceof Map ||
          segmentNode[H.SYMLINK] === 0 ||
          opts.followLeaf === false)
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
      } else {
        if (segmentNode[H.SYMLINK] === 0) {
          // Regular file in a directory path
          return null;
        }

        // Symlink in a directory path
        const normalSymlinkTarget = this._resolveSymlinkTargetToNormalPath(
          segmentNode,
          isLastSegment
            ? targetNormalPath
            : targetNormalPath.slice(0, fromIdx - 1),
        );

        // Append any subsequent path segments to the symlink target, and reset
        // with our new target.
        targetNormalPath = isLastSegment
          ? normalSymlinkTarget
          : normalSymlinkTarget + path.sep + targetNormalPath.slice(fromIdx);
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

  *metadataIterator(opts: {
    includeSymlinks: boolean,
    includeNodeModules: boolean,
  }): Iterable<{
    baseName: string,
    canonicalPath: string,
    metadata: FileMetaData,
  }> {
    yield* this._metadataIterator(this.#rootNode, opts);
  }

  *_metadataIterator(
    rootNode: DirectoryNode,
    opts: {includeSymlinks: boolean, includeNodeModules: boolean},
    prefix: string = '',
  ): Iterable<{
    baseName: string,
    canonicalPath: string,
    metadata: FileMetaData,
  }> {
    for (const [name, node] of rootNode) {
      if (
        !opts.includeNodeModules &&
        node instanceof Map &&
        name === 'node_modules'
      ) {
        continue;
      }
      const prefixedName = prefix === '' ? name : prefix + path.sep + name;
      if (node instanceof Map) {
        yield* this._metadataIterator(node, opts, prefixedName);
      } else if (node[H.SYMLINK] === 0 || opts.includeSymlinks) {
        yield {canonicalPath: prefixedName, metadata: node, baseName: name};
      }
    }
  }

  _normalizePath(relativeOrAbsolutePath: Path): string {
    return path.isAbsolute(relativeOrAbsolutePath)
      ? fastPath.relative(this.#rootDir, relativeOrAbsolutePath)
      : path.normalize(relativeOrAbsolutePath);
  }

  /**
   * Enumerate paths under a given node, including symlinks and through
   * symlinks (if `follow` is enabled).
   */
  *_pathIterator(
    rootNode: DirectoryNode,
    opts: $ReadOnly<{
      alwaysYieldPosix: boolean,
      canonicalPathOfRoot: string,
      follow: boolean,
      recursive: boolean,
      subtreeOnly: boolean,
    }>,
    pathPrefix: string = '',
    followedLinks: $ReadOnlySet<FileMetaData> = new Set(),
  ): Iterable<Path> {
    const pathSep = opts.alwaysYieldPosix ? '/' : path.sep;
    const prefixWithSep = pathPrefix === '' ? pathPrefix : pathPrefix + pathSep;
    for (const [name, node] of rootNode ?? this.#rootNode) {
      if (opts.subtreeOnly && name === '..') {
        continue;
      }

      const nodePath = prefixWithSep + name;
      if (!(node instanceof Map)) {
        if (node[H.SYMLINK] === 0) {
          // regular file
          yield nodePath;
        } else {
          // symlink
          const nodePathWithSystemSeparators =
            pathSep === path.sep
              ? nodePath
              : nodePath.replaceAll(pathSep, path.sep);

          // Although both paths are normal, the node path may begin '..' so we
          // can't simply concatenate.
          const normalPathOfSymlink = path.join(
            opts.canonicalPathOfRoot,
            nodePathWithSystemSeparators,
          );

          // We can't resolve the symlink directly here because we only have
          // its normal path, and we need a canonical path for resolution
          // (imagine our normal path contains a symlink 'bar' -> '.', and we
          // are at /foo/bar/baz where baz -> '..' - that should resolve to
          // /foo, not /foo/bar). We *can* use _lookupByNormalPath to walk to
          // the canonical symlink, and then to its target.
          const resolved = this._lookupByNormalPath(normalPathOfSymlink, {
            followLeaf: true,
          });
          if (resolved == null) {
            // Symlink goes nowhere, nothing to report.
            continue;
          }
          const target = resolved.node;
          if (!(target instanceof Map)) {
            // Symlink points to a file, just yield the path of the symlink.
            yield nodePath;
          } else if (
            opts.recursive &&
            opts.follow &&
            !followedLinks.has(node)
          ) {
            // Symlink points to a directory - iterate over its contents using
            // the path where we found the symlink as a prefix.
            yield* this._pathIterator(
              target,
              opts,
              nodePath,
              new Set([...followedLinks, node]),
            );
          }
        }
      } else if (opts.recursive) {
        yield* this._pathIterator(node, opts, nodePath, followedLinks);
      }
    }
  }

  _resolveSymlinkTargetToNormalPath(
    symlinkNode: FileMetaData,
    canonicalPathOfSymlink: Path,
  ): Path {
    let normalSymlinkTarget = this.#cachedNormalSymlinkTargets.get(symlinkNode);
    if (normalSymlinkTarget != null) {
      return normalSymlinkTarget;
    }

    const literalSymlinkTarget = symlinkNode[H.SYMLINK];
    invariant(
      typeof literalSymlinkTarget === 'string',
      'Expected symlink target to be populated.',
    );
    if (path.isAbsolute(literalSymlinkTarget)) {
      normalSymlinkTarget = path.relative(this.#rootDir, literalSymlinkTarget);
    } else {
      normalSymlinkTarget = path.normalize(
        path.join(path.dirname(canonicalPathOfSymlink), literalSymlinkTarget),
      );
    }
    this.#cachedNormalSymlinkTargets.set(symlinkNode, normalSymlinkTarget);
    return normalSymlinkTarget;
  }

  _getFileData(
    filePath: Path,
    opts: {followLeaf: boolean} = {followLeaf: true},
  ): ?FileMetaData {
    const normalPath = this._normalizePath(filePath);
    const result = this._lookupByNormalPath(normalPath, {
      followLeaf: opts.followLeaf,
    });
    if (result == null || result.node instanceof Map) {
      return null;
    }
    return result.node;
  }

  _cloneTree(root: DirectoryNode): DirectoryNode {
    const clone: DirectoryNode = new Map();
    for (const [name, node] of root) {
      if (node instanceof Map) {
        clone.set(name, this._cloneTree(node));
      } else {
        clone.set(name, [...node]);
      }
    }
    return clone;
  }
}
