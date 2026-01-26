/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import type {
  CacheData,
  FileData,
  FileMetadata,
  FileStats,
  LookupResult,
  MutableFileSystem,
  Path,
  ProcessFileFunction,
} from '../flow-types';

type DirectoryNode = Map<string, MixedNode>;
type FileNode = FileMetadata;
type MixedNode = FileNode | DirectoryNode;
type DeserializedSnapshotInput = {
  rootDir: string;
  fileSystemData: DirectoryNode;
  processFile: ProcessFileFunction;
};
type TreeFSOptions = {
  rootDir: Path;
  files?: FileData;
  processFile: ProcessFileFunction;
};
type MatchFilesOptions = Readonly<{
  filter?: null | undefined | RegExp;
  filterCompareAbsolute?: boolean;
  filterComparePosix?: boolean;
  follow?: boolean;
  recursive?: boolean;
  rootDir?: null | undefined | Path;
}>;
type MetadataIteratorOptions = Readonly<{
  includeSymlinks: boolean;
  includeNodeModules: boolean;
}>;
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
declare class TreeFS implements MutableFileSystem {
  constructor(opts: TreeFSOptions);
  getSerializableSnapshot(): CacheData['fileSystemData'];
  static fromDeserializedSnapshot(args: DeserializedSnapshotInput): TreeFS;
  getSize(mixedPath: Path): null | undefined | number;
  getDependencies(mixedPath: Path): null | undefined | Array<string>;
  getDifference(files: FileData): {
    changedFiles: FileData;
    removedFiles: Set<string>;
  };
  getSha1(mixedPath: Path): null | undefined | string;
  getOrComputeSha1(
    mixedPath: Path,
  ): Promise<null | undefined | {sha1: string; content?: Buffer}>;
  exists(mixedPath: Path): boolean;
  lookup(mixedPath: Path): LookupResult;
  getAllFiles(): Array<Path>;
  linkStats(mixedPath: Path): null | undefined | FileStats;
  /**
   * Given a search context, return a list of file paths matching the query.
   * The query matches against normalized paths which start with `./`,
   * for example: `a/b.js` -> `./a/b.js`
   */
  matchFiles(opts: MatchFilesOptions): Iterable<Path>;
  addOrModify(mixedPath: Path, metadata: FileMetadata): void;
  bulkAddOrModify(addedOrModifiedFiles: FileData): void;
  remove(mixedPath: Path): null | undefined | FileMetadata;
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
      breakOnSegment: null | undefined | string;
      invalidatedBy: null | undefined | Set<string>;
      subpathType: 'f' | 'd';
    },
  ): null | undefined | {absolutePath: string; containerRelativePath: string};
  metadataIterator(opts: MetadataIteratorOptions): Iterator<{
    baseName: string;
    canonicalPath: string;
    metadata: FileMetadata;
  }>;
}
export default TreeFS;
