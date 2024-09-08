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
  LookupResult,
  MutableFileSystem,
  Path,
} from '../flow-types';

import H from '../constants';
import {RootPathUtils} from './RootPathUtils';
import invariant from 'invariant';
import path from 'path';

type DirectoryNode = Map<string, MixedNode>;
type FileNode = FileMetaData;
type MixedNode = FileNode | DirectoryNode;

function isDirectory(node: ?MixedNode): node is DirectoryNode {
  return node instanceof Map;
}

function isRegularFile(node: FileNode): boolean {
  return node[H.SYMLINK] === 0;
}

type NormalizedSymlinkTarget = {
  ancestorOfRootIdx: ?number,
  normalPath: string,
  startOfBasenameIdx: number,
};

/**
 * OVERVIEW:
 *
 * TreeFS is Metro's in-memory representation of the file system. It is
 * structured as a tree of non-empty maps and leaves (tuples), with the root
 * node representing the given `rootDir`, typically Metro's _project root_
 * (not a filesystem root). Map keys are path segments, and branches outside
 * the project root are accessed via `'..'`.
 *
 * EXAMPLE:
 *
 * For a root dir '/data/project', the file '/data/other/app/index.js' would
 * have metadata at #rootNode.get('..').get('other').get('app').get('index.js')
 *
 * SERIALISATION:
 *
 * #rootNode is designed to be directly serialisable and directly portable (for
 * a given project) between different root directories and operating systems.
 *
 * SYMLINKS:
 *
 * Symlinks are represented as nodes whose metadata contains their literal
 * target. Literal targets are resolved to normal paths at runtime, and cached.
 * If a symlink is encountered during traversal, we restart traversal at the
 * root node targeting join(normal symlink target, remaining path suffix).
 *
 * NODE TYPES:
 *
 * - A directory (including a parent directory at '..') is represented by a
 *   `Map` of basenames to any other node type.
 * - A file is represented by an `Array`  (tuple) of metadata, of which:
 *   - A regular file has node[H.SYMLINK] === 0
 *   - A symlink has node[H.SYMLINK] === 1 or
 *     typeof node[H.SYMLINK] === 'string', where a string is the literal
 *     content of the symlink (i.e. from readlink), if known.
 *
 * TERMINOLOGY:
 *
 * - mixedPath
 *   A root-relative or absolute path
 * - relativePath
 *   A root-relative path
 * - normalPath
 *   A root-relative, normalised path (no extraneous '.' or '..'), may have a
 *   single trailing slash
 * - canonicalPath
 *   A root-relative, normalised, real path (no symlinks in dirname), never has
 *   a trailing slash
 */
export default class TreeFS implements MutableFileSystem {
  +#cachedNormalSymlinkTargets: WeakMap<FileNode, NormalizedSymlinkTarget> =
    new WeakMap();
  +#rootDir: Path;
  #rootNode: DirectoryNode = new Map();
  #pathUtils: RootPathUtils;

  constructor({rootDir, files}: {rootDir: Path, files?: FileData}) {
    this.#rootDir = rootDir;
    this.#pathUtils = new RootPathUtils(rootDir);
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
        if (isRegularFile(newMetadata) !== isRegularFile(metadata)) {
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

  lookup(mixedPath: Path): LookupResult {
    const normalPath = this._normalizePath(mixedPath);
    const links = new Set<string>();
    const result = this._lookupByNormalPath(normalPath, {
      collectLinkPaths: links,
      followLeaf: true,
    });
    if (!result.exists) {
      const {canonicalMissingPath} = result;
      return {
        exists: false,
        links,
        missing: this.#pathUtils.normalToAbsolute(canonicalMissingPath),
      };
    }
    const {canonicalPath, node} = result;
    const type = isDirectory(node) ? 'd' : isRegularFile(node) ? 'f' : 'l';
    invariant(
      type !== 'l',
      'lookup follows symlinks, so should never return one (%s -> %s)',
      mixedPath,
      canonicalPath,
    );
    return {
      exists: true,
      links,
      realPath: this.#pathUtils.normalToAbsolute(canonicalPath),
      type,
    };
  }

  getAllFiles(): Array<Path> {
    return Array.from(
      this.metadataIterator({
        includeSymlinks: false,
        includeNodeModules: true,
      }),
      ({canonicalPath}) => this.#pathUtils.normalToAbsolute(canonicalPath),
    );
  }

  linkStats(mixedPath: Path): ?FileStats {
    const fileMetadata = this._getFileData(mixedPath, {followLeaf: false});
    if (fileMetadata == null) {
      return null;
    }
    const fileType = isRegularFile(fileMetadata) ? 'f' : 'l';
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
    if (!contextRootResult.exists) {
      return;
    }
    const {
      ancestorOfRootIdx,
      canonicalPath: rootRealPath,
      node: contextRoot,
      parentNode: contextRootParent,
    } = contextRootResult;
    if (!isDirectory(contextRoot)) {
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

    for (const relativePathForComparison of this._pathIterator(
      contextRoot,
      contextRootParent,
      ancestorOfRootIdx,
      {
        alwaysYieldPosix: filterComparePosix,
        canonicalPathOfRoot: rootRealPath,
        follow,
        recursive,
        subtreeOnly: rootDir != null,
      },
    )) {
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

  addOrModify(mixedPath: Path, metadata: FileMetaData): void {
    const normalPath = this._normalizePath(mixedPath);
    // Walk the tree to find the *real* path of the parent node, creating
    // directories as we need.
    const parentDirNode = this._lookupByNormalPath(path.dirname(normalPath), {
      makeDirectories: true,
    });
    if (!parentDirNode.exists) {
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
        if (!lookup.exists) {
          // This should only be possible if the input is non-real and
          // lookup hits a broken symlink.
          throw new Error(
            `TreeFS: Unexpected error adding ${normalPath}.\nMissing: ` +
              lookup.canonicalMissingPath,
          );
        }
        if (!isDirectory(lookup.node)) {
          throw new Error(
            `TreeFS: Could not add directory ${dirname}, adding ${normalPath}. ` +
              `${dirname} already exists in the file map as a file.`,
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
    if (!result.exists) {
      return null;
    }
    const {parentNode, canonicalPath, node} = result;

    if (isDirectory(node) && node.size > 0) {
      throw new Error(
        `TreeFS: remove called on a non-empty directory: ${mixedPath}`,
      );
    }
    if (parentNode != null) {
      parentNode.delete(path.basename(canonicalPath));
      if (parentNode.size === 0 && parentNode !== this.#rootNode) {
        // NB: This isn't the most efficient algorithm - in the case of
        // removing the last file in a deep hierarchy it's O(depth^2), but
        // that's not expected to be a case common enough to justify
        // implementation complexity, or slowing down more common uses of
        // _lookupByNormalPath.
        this.remove(path.dirname(canonicalPath));
      }
    }
    return isDirectory(node) ? null : node;
  }

  /**
   * The core traversal algorithm of TreeFS - takes a normal path and traverses
   * through a tree of maps keyed on path segments, returning the node,
   * canonical path, and other metadata if successful, or the first missing
   * segment otherwise.
   *
   * When a symlink is encountered, we set a new target of the symlink's
   * normalised target path plus the remainder of the original target path. In
   * this way, the eventual target path in a successful lookup has all symlinks
   * resolved, and gives us the real path "for free". Similarly if a traversal
   * fails, we automatically have the real path of the first non-existent node.
   *
   * Note that this code is extremely hot during resolution, being the most
   * expensive part of a file existence check. Benchmark any modifications!
   */
  _lookupByNormalPath(
    requestedNormalPath: string,
    opts: {
      collectAncestors?: Array<{
        ancestorOfRootIdx: ?number,
        node: DirectoryNode,
        normalPath: string,
        segmentName: string,
      }>,
      // Mutable Set into which absolute real paths of traversed symlinks will
      // be added. Omit for performance if not needed.
      collectLinkPaths?: ?Set<string>,

      // Like lstat vs stat, whether to follow a symlink at the basename of
      // the given path, or return the details of the symlink itself.
      followLeaf?: boolean,
      // Whether to (recursively) create missing directory nodes during
      // traversal, useful when adding files. Will throw if an expected
      // directory is already present as a file.
      makeDirectories?: boolean,
      startPathIdx?: number,
      startNode?: DirectoryNode,
      start?: {
        ancestorOfRootIdx: ?number,
        node: DirectoryNode,
        pathIdx: number,
      },
    } = {followLeaf: true, makeDirectories: false},
  ):
    | {
        ancestorOfRootIdx: ?number,
        canonicalPath: string,
        exists: true,
        node: MixedNode,
        parentNode: DirectoryNode,
      }
    | {
        ancestorOfRootIdx: ?number,
        canonicalPath: string,
        exists: true,
        node: DirectoryNode,
        parentNode: null,
      }
    | {
        canonicalMissingPath: string,
        missingSegmentName: string,
        exists: false,
      } {
    // We'll update the target if we hit a symlink.
    let targetNormalPath = requestedNormalPath;
    // Lazy-initialised set of seen target paths, to detect symlink cycles.
    let seen: ?Set<string>;
    // Pointer to the first character of the current path segment in
    // targetNormalPath.
    let fromIdx = opts.start?.pathIdx ?? 0;
    // The parent of the current segment.
    let parentNode = opts.start?.node ?? this.#rootNode;
    // If a returned node is (an ancestor of) the root, this is the number of
    // levels below the root, i.e. '' is 0, '..' is 1, '../..' is 2, otherwise
    // null.
    let ancestorOfRootIdx: ?number = opts.start?.ancestorOfRootIdx ?? 0;

    const collectAncestors = opts.collectAncestors;
    // Used only when collecting ancestors, to avoid double-counting nodes and
    // paths when traversing a symlink takes us back to rootNode and out again.
    // This tracks the first character of the first segment not already
    // collected.
    let unseenPathFromIdx = 0;

    while (targetNormalPath.length > fromIdx) {
      const nextSepIdx = targetNormalPath.indexOf(path.sep, fromIdx);
      const isLastSegment = nextSepIdx === -1;
      const segmentName = isLastSegment
        ? targetNormalPath.slice(fromIdx)
        : targetNormalPath.slice(fromIdx, nextSepIdx);
      const isUnseen = fromIdx >= unseenPathFromIdx;
      fromIdx = !isLastSegment ? nextSepIdx + 1 : targetNormalPath.length;

      if (segmentName === '.') {
        continue;
      }

      let segmentNode = parentNode.get(segmentName);

      // In normal paths all indirections are at the prefix, so we are at the
      // nth ancestor of the root iff the path so far is n '..' segments.
      if (segmentName === '..' && ancestorOfRootIdx != null) {
        ancestorOfRootIdx++;
      } else if (segmentNode != null) {
        ancestorOfRootIdx = null;
      }

      if (segmentNode == null) {
        if (opts.makeDirectories !== true && segmentName !== '..') {
          return {
            canonicalMissingPath: isLastSegment
              ? targetNormalPath
              : targetNormalPath.slice(0, fromIdx - 1),
            exists: false,
            missingSegmentName: segmentName,
          };
        }
        segmentNode = new Map();
        if (opts.makeDirectories === true) {
          parentNode.set(segmentName, segmentNode);
        }
      }

      // We are done if...
      if (
        // ...at a directory node and the only subsequent character is `/`, or
        (nextSepIdx === targetNormalPath.length - 1 &&
          isDirectory(segmentNode)) ||
        // there are no subsequent `/`, and this node is anything but a symlink
        // we're required to resolve due to followLeaf.
        (isLastSegment &&
          (isDirectory(segmentNode) ||
            isRegularFile(segmentNode) ||
            opts.followLeaf === false))
      ) {
        return {
          ancestorOfRootIdx,
          canonicalPath: isLastSegment
            ? targetNormalPath
            : targetNormalPath.slice(0, -1), // remove trailing `/`
          exists: true,
          node: segmentNode,
          parentNode,
        };
      }

      // If the next node is a directory, go into it
      if (isDirectory(segmentNode)) {
        parentNode = segmentNode;
        if (collectAncestors && isUnseen) {
          const currentPath = isLastSegment
            ? targetNormalPath
            : targetNormalPath.slice(0, fromIdx - 1);
          collectAncestors.push({
            ancestorOfRootIdx,
            node: segmentNode,
            normalPath: currentPath,
            segmentName,
          });
        }
      } else {
        const currentPath = isLastSegment
          ? targetNormalPath
          : targetNormalPath.slice(0, fromIdx - 1);

        if (isRegularFile(segmentNode)) {
          // Regular file in a directory path
          return {
            canonicalMissingPath: currentPath,
            exists: false,
            missingSegmentName: segmentName,
          };
        }

        // Symlink in a directory path
        const normalSymlinkTarget = this._resolveSymlinkTargetToNormalPath(
          segmentNode,
          currentPath,
        );
        if (opts.collectLinkPaths) {
          opts.collectLinkPaths.add(
            this.#pathUtils.normalToAbsolute(currentPath),
          );
        }

        const remainingTargetPath = isLastSegment
          ? ''
          : targetNormalPath.slice(fromIdx);

        // Append any subsequent path segments to the symlink target, and reset
        // with our new target.
        const joinedResult = this.#pathUtils.joinNormalToRelative(
          normalSymlinkTarget.normalPath,
          remainingTargetPath,
        );

        targetNormalPath = joinedResult.normalPath;

        // Two special cases (covered by unit tests):
        //
        // If the symlink target is the root, the root should be a counted as
        // an ancestor. We'd otherwise miss counting it because we normally
        // push new ancestors only when entering a directory.
        //
        // If the symlink target is an ancestor of the root *and* joining it
        // with the remaining path results in collapsing segments, e.g:
        // '../..' + 'parentofroot/root/foo.js' = 'foo.js', then we must add
        // parentofroot and root as ancestors.
        if (
          collectAncestors &&
          !isLastSegment &&
          // No-op optimisation to bail out the common case of nothing to do.
          (normalSymlinkTarget.ancestorOfRootIdx === 0 ||
            joinedResult.collapsedSegments > 0)
        ) {
          let node: MixedNode = this.#rootNode;
          let collapsedPath = '';
          const reverseAncestors = [];
          for (
            let i = 0;
            i <= joinedResult.collapsedSegments &&
            /* for Flow, always true: */ isDirectory(node);
            i++
          ) {
            if (
              // Add the root only if the target is the root or we have
              // collapsed segments.
              i > 0 ||
              normalSymlinkTarget.ancestorOfRootIdx === 0 ||
              joinedResult.collapsedSegments > 0
            ) {
              reverseAncestors.push({
                ancestorOfRootIdx: i,
                node,
                normalPath: collapsedPath,
                segmentName: this.#pathUtils.getBasenameOfNthAncestor(i),
              });
            }
            node = node.get('..') ?? new Map();
            collapsedPath =
              collapsedPath === '' ? '..' : collapsedPath + path.sep + '..';
          }
          collectAncestors.push(...reverseAncestors.reverse());
        }

        // For the purpose of collecting ancestors: Ignore the traversal to
        // the symlink target, and start collecting ancestors only
        // from the target itself (ie, the basename of the normal target path)
        // onwards.
        unseenPathFromIdx = normalSymlinkTarget.startOfBasenameIdx;

        if (seen == null) {
          // Optimisation: set this lazily only when we've encountered a symlink
          seen = new Set([requestedNormalPath]);
        }
        if (seen.has(targetNormalPath)) {
          // TODO: Warn `Symlink cycle detected: ${[...seen, node].join(' -> ')}`
          return {
            canonicalMissingPath: targetNormalPath,
            exists: false,
            missingSegmentName: segmentName,
          };
        }
        seen.add(targetNormalPath);
        fromIdx = 0;
        parentNode = this.#rootNode;
        ancestorOfRootIdx = 0;
      }
    }
    invariant(parentNode === this.#rootNode, 'Unexpectedly escaped traversal');
    return {
      ancestorOfRootIdx: 0,
      canonicalPath: targetNormalPath,
      exists: true,
      node: this.#rootNode,
      parentNode: null,
    };
  }

  /**
   * Given a start path (which need not exist), a subpath and type, and
   * optionally a 'breakOnSegment', performs the following:
   *
   * X = mixedStartPath
   * do
   *   if basename(X) === opts.breakOnSegment
   *     return null
   *   if X + subpath exists and has type opts.subpathType
   *     return {
   *       absolutePath: realpath(X + subpath)
   *       containerRelativePath: relative(mixedStartPath, X)
   *     }
   *   X = dirname(X)
   * while X !== dirname(X)
   *
   * If opts.invalidatedBy is given, collects all absolute, real paths that if
   * added or removed may invalidate this result.
   *
   * Useful for finding the closest package scope (subpath: package.json,
   * type f, breakOnSegment: node_modules) or closest potential package root
   * (subpath: node_modules/pkg, type: d) in Node.js resolution.
   */
  hierarchicalLookup(
    mixedStartPath: string,
    subpath: string,
    opts: {
      breakOnSegment: ?string,
      invalidatedBy: ?Set<string>,
      subpathType: 'f' | 'd',
    },
  ): ?{
    absolutePath: string,
    containerRelativePath: string,
  } {
    const ancestorsOfInput: Array<{
      ancestorOfRootIdx: ?number,
      node: DirectoryNode,
      normalPath: string,
      segmentName: string,
    }> = [];
    const normalPath = this._normalizePath(mixedStartPath);
    const invalidatedBy = opts.invalidatedBy;
    const closestLookup = this._lookupByNormalPath(normalPath, {
      collectAncestors: ancestorsOfInput,
      collectLinkPaths: invalidatedBy,
    });

    if (closestLookup.exists && isDirectory(closestLookup.node)) {
      const maybeAbsolutePathMatch = this.#checkCandidateHasSubpath(
        closestLookup.canonicalPath,
        subpath,
        opts.subpathType,
        invalidatedBy,
        null,
      );
      if (maybeAbsolutePathMatch != null) {
        return {
          absolutePath: maybeAbsolutePathMatch,
          containerRelativePath: '',
        };
      }
    } else {
      if (
        invalidatedBy &&
        (!closestLookup.exists || !isDirectory(closestLookup.node))
      ) {
        invalidatedBy.add(
          this.#pathUtils.normalToAbsolute(
            closestLookup.exists
              ? closestLookup.canonicalPath
              : closestLookup.canonicalMissingPath,
          ),
        );
      }
      if (
        opts.breakOnSegment != null &&
        !closestLookup.exists &&
        closestLookup.missingSegmentName === opts.breakOnSegment
      ) {
        return null;
      }
    }

    // Let the "common root" be the nearest common ancestor of this.rootDir
    // and the input path. We'll look for a match in two stages:
    // 1. Every collected ancestor of the input path, from nearest to furthest,
    //    that is a descendent of the common root
    // 2. The common root, and its ancestors.
    let commonRoot = this.#rootNode;
    let commonRootDepth = 0;

    // Collected ancestors do not include the lookup result itself, so go one
    // further if the input path is itself a root ancestor.
    if (closestLookup.exists && closestLookup.ancestorOfRootIdx != null) {
      commonRootDepth = closestLookup.ancestorOfRootIdx;
      invariant(
        isDirectory(closestLookup.node),
        'ancestors of the root must be directories',
      );
      commonRoot = closestLookup.node;
    } else {
      // Establish the common root by counting the '..' segments at the start
      // of the collected ancestors.
      for (const ancestor of ancestorsOfInput) {
        if (ancestor.ancestorOfRootIdx == null) {
          break;
        }
        commonRootDepth = ancestor.ancestorOfRootIdx;
        commonRoot = ancestor.node;
      }
    }

    // Phase 1: Consider descendenants of the common root, from deepest to
    // shallowest.
    for (
      let candidateIdx = ancestorsOfInput.length - 1;
      candidateIdx >= commonRootDepth;
      --candidateIdx
    ) {
      const candidate = ancestorsOfInput[candidateIdx];
      if (candidate.segmentName === opts.breakOnSegment) {
        return null;
      }
      const maybeAbsolutePathMatch = this.#checkCandidateHasSubpath(
        candidate.normalPath,
        subpath,
        opts.subpathType,
        invalidatedBy,
        {
          ancestorOfRootIdx: candidate.ancestorOfRootIdx,
          node: candidate.node,
          pathIdx:
            candidate.normalPath.length > 0
              ? candidate.normalPath.length + 1
              : 0,
        },
      );
      if (maybeAbsolutePathMatch != null) {
        // Determine the input path relative to the current candidate. Note
        // that the candidate path will always be canonical (real), whereas the
        // input may contain symlinks, so the candidate is not necessarily a
        // prefix of the input. Use the fact that each remaining candidate
        // corresponds to a leading segment of the input normal path, and
        // discard the first candidateIdx + 1 segments of the input path.
        //
        // The next 5 lines are equivalent to (but faster than)
        // normalPath.split('/').slice(candidateIdx + 1).join('/').
        let prefixLength = commonRootDepth * 3; // Leading '../'
        for (let i = commonRootDepth; i <= candidateIdx; i++) {
          prefixLength = normalPath.indexOf(path.sep, prefixLength + 1);
        }
        const containerRelativePath = normalPath.slice(prefixLength + 1);
        return {
          absolutePath: maybeAbsolutePathMatch,
          containerRelativePath,
        };
      }
    }

    // Phase 2: Consider the common root and its ancestors

    // This will be '', '..', '../..', etc.
    let candidateNormalPath =
      commonRootDepth > 0 ? normalPath.slice(0, 3 * commonRootDepth - 1) : '';
    const remainingNormalPath = normalPath.slice(commonRootDepth * 3);

    let nextNode: ?MixedNode = commonRoot;
    let depthBelowCommonRoot = 0;

    while (isDirectory(nextNode)) {
      const maybeAbsolutePathMatch = this.#checkCandidateHasSubpath(
        candidateNormalPath,
        subpath,
        opts.subpathType,
        invalidatedBy,
        null,
      );
      if (maybeAbsolutePathMatch != null) {
        const rootDirParts = this.#pathUtils.getParts();
        const relativeParts =
          depthBelowCommonRoot > 0
            ? rootDirParts.slice(
                -(depthBelowCommonRoot + commonRootDepth),
                commonRootDepth > 0 ? -commonRootDepth : undefined,
              )
            : [];
        if (remainingNormalPath !== '') {
          relativeParts.push(remainingNormalPath);
        }
        return {
          absolutePath: maybeAbsolutePathMatch,
          containerRelativePath: relativeParts.join(path.sep),
        };
      }
      depthBelowCommonRoot++;
      candidateNormalPath =
        candidateNormalPath === ''
          ? '..'
          : candidateNormalPath + path.sep + '..';
      nextNode = nextNode.get('..');
    }
    return null;
  }

  #checkCandidateHasSubpath(
    normalCandidatePath: string,
    subpath: string,
    subpathType: 'f' | 'd',
    invalidatedBy: ?Set<string>,
    start: ?{
      ancestorOfRootIdx: ?number,
      node: DirectoryNode,
      pathIdx: number,
    },
  ): ?string {
    const lookupResult = this._lookupByNormalPath(
      this.#pathUtils.joinNormalToRelative(normalCandidatePath, subpath)
        .normalPath,
      {
        collectLinkPaths: invalidatedBy,
      },
    );
    if (
      lookupResult.exists &&
      // Should be a Map iff subpathType is directory
      isDirectory(lookupResult.node) === (subpathType === 'd')
    ) {
      return this.#pathUtils.normalToAbsolute(lookupResult.canonicalPath);
    } else if (invalidatedBy) {
      invalidatedBy.add(
        this.#pathUtils.normalToAbsolute(
          lookupResult.exists
            ? lookupResult.canonicalPath
            : lookupResult.canonicalMissingPath,
        ),
      );
    }
    return null;
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
        isDirectory(node) &&
        name === 'node_modules'
      ) {
        continue;
      }
      const prefixedName = prefix === '' ? name : prefix + path.sep + name;
      if (isDirectory(node)) {
        yield* this._metadataIterator(node, opts, prefixedName);
      } else if (isRegularFile(node) || opts.includeSymlinks) {
        yield {canonicalPath: prefixedName, metadata: node, baseName: name};
      }
    }
  }

  _normalizePath(relativeOrAbsolutePath: Path): string {
    return path.isAbsolute(relativeOrAbsolutePath)
      ? this.#pathUtils.absoluteToNormal(relativeOrAbsolutePath)
      : this.#pathUtils.relativeToNormal(relativeOrAbsolutePath);
  }

  *#directoryNodeIterator(
    node: DirectoryNode,
    parent: ?DirectoryNode,
    ancestorOfRootIdx: ?number,
  ): Iterator<[string, MixedNode]> {
    if (ancestorOfRootIdx != null && ancestorOfRootIdx > 0 && parent) {
      yield [
        this.#pathUtils.getBasenameOfNthAncestor(ancestorOfRootIdx - 1),
        parent,
      ];
    }
    yield* node.entries();
  }

  /**
   * Enumerate paths under a given node, including symlinks and through
   * symlinks (if `follow` is enabled).
   */
  *_pathIterator(
    iterationRootNode: DirectoryNode,
    iterationRootParentNode: ?DirectoryNode,
    ancestorOfRootIdx: ?number,
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
    for (const [name, node] of this.#directoryNodeIterator(
      iterationRootNode,
      iterationRootParentNode,
      ancestorOfRootIdx,
    )) {
      if (opts.subtreeOnly && name === '..') {
        continue;
      }

      const nodePath = prefixWithSep + name;
      if (!isDirectory(node)) {
        if (isRegularFile(node)) {
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
          if (!resolved.exists) {
            // Symlink goes nowhere, nothing to report.
            continue;
          }
          const target = resolved.node;
          if (!isDirectory(target)) {
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
              resolved.parentNode,
              resolved.ancestorOfRootIdx,
              opts,
              nodePath,
              new Set([...followedLinks, node]),
            );
          }
        }
      } else if (opts.recursive) {
        yield* this._pathIterator(
          node,
          iterationRootParentNode,
          ancestorOfRootIdx != null && ancestorOfRootIdx > 0
            ? ancestorOfRootIdx - 1
            : null,
          opts,
          nodePath,
          followedLinks,
        );
      }
    }
  }

  _resolveSymlinkTargetToNormalPath(
    symlinkNode: FileMetaData,
    canonicalPathOfSymlink: Path,
  ): NormalizedSymlinkTarget {
    const cachedResult = this.#cachedNormalSymlinkTargets.get(symlinkNode);
    if (cachedResult != null) {
      return cachedResult;
    }

    const literalSymlinkTarget = symlinkNode[H.SYMLINK];
    invariant(
      typeof literalSymlinkTarget === 'string',
      'Expected symlink target to be populated.',
    );
    const absoluteSymlinkTarget = path.resolve(
      this.#rootDir,
      canonicalPathOfSymlink,
      '..', // Symlink target is relative to its containing directory.
      literalSymlinkTarget, // May be absolute, in which case the above are ignored
    );
    const normalSymlinkTarget = path.relative(
      this.#rootDir,
      absoluteSymlinkTarget,
    );
    const result = {
      ancestorOfRootIdx:
        this.#pathUtils.getAncestorOfRootIdx(normalSymlinkTarget),
      normalPath: normalSymlinkTarget,
      startOfBasenameIdx: normalSymlinkTarget.lastIndexOf(path.sep) + 1,
    };
    this.#cachedNormalSymlinkTargets.set(symlinkNode, result);
    return result;
  }

  _getFileData(
    filePath: Path,
    opts: {followLeaf: boolean} = {followLeaf: true},
  ): ?FileMetaData {
    const normalPath = this._normalizePath(filePath);
    const result = this._lookupByNormalPath(normalPath, {
      followLeaf: opts.followLeaf,
    });
    if (!result.exists || isDirectory(result.node)) {
      return null;
    }
    return result.node;
  }

  _cloneTree(root: DirectoryNode): DirectoryNode {
    const clone: DirectoryNode = new Map();
    for (const [name, node] of root) {
      if (isDirectory(node)) {
        clone.set(name, this._cloneTree(node));
      } else {
        clone.set(name, [...node]);
      }
    }
    return clone;
  }
}
