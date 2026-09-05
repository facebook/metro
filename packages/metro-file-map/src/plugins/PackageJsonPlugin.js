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

import type {
  FileMapPlugin,
  FileMapPluginInitOptions,
  FileMapPluginWorker,
  PluginLookupResult,
  ReadonlyFileSystemChanges,
} from '../flow-types';

import {RootPathUtils} from '../lib/RootPathUtils';
import path from 'node:path';

/**
 * The package scope of a path: the nearest enclosing directory containing a
 * `package.json`, not crossing a `node_modules` boundary.
 */
export type PackageScope = Readonly<{
  // Absolute, real path of the `package.json` file.
  packageJsonPath: string,
  // Absolute, real path of the directory containing `package.json`.
  rootPath: string,
  // The queried path relative to `rootPath`, with system separators and no
  // leading './'. Empty for the package root directory itself.
  packageRelativePath: string,
}>;

export type PackageJsonPluginOptions = Readonly<{
  rootDir: string,
}>;

type PackageEntry = Readonly<{
  packageJsonPath: string,
  rootPath: string,
}>;

// The nearest package of a directory, with the directory's path relative to
// that package's root. `entry` is null for directories in no package.
type NearestPackage = Readonly<{
  entry: PackageEntry | null,
  relDir: string,
}>;

const NO_PACKAGE: NearestPackage = Object.freeze({entry: null, relDir: ''});

const PACKAGE_JSON = 'package.json';
const NODE_MODULES = 'node_modules';
const SEP = path.sep;
const SEP_CODE = SEP.charCodeAt(0);
const COLON_CODE = ':'.charCodeAt(0);
const IS_WIN32 = SEP === '\\';

/**
 * Indexes `package.json` files and answers "which package contains this
 * path?" in constant amortized time: the nearest enclosing directory with a
 * `package.json`, not crossing a `node_modules` boundary, as in Node's
 * package scope lookup.
 *
 * The index is keyed on absolute, real directory paths and the ascent is over
 * real parents, so a query never depends on which symlinks it arrived
 * through: a path through a symlinked directory takes the scope of the link
 * target, as it does for Node. This differs from
 * `FileSystem.hierarchicalLookup`, which walks the lexical ancestors of the
 * path as given. Each directory's answer is memoized on first query with path
 * compression (every directory visited on the way to an answer is written),
 * so the amortized cost across a project is one probe per directory rather
 * than one walk per file.
 */
export default class PackageJsonPlugin implements FileMapPlugin<null, void> {
  readonly name: 'packageJson' = 'packageJson';

  #lookup: string => PluginLookupResult<void> = () => {
    throw new Error('PackageJsonPlugin has not been initialized');
  };
  // Absolute, real directory path → the package.json it contains
  readonly #packages: Map<string, PackageEntry> = new Map();
  // Absolute, real directory path → its nearest package, or null if there is
  // none before a node_modules boundary or the filesystem root
  #nearestByDir: Map<string, NearestPackage> = new Map();
  readonly #pathUtils: RootPathUtils;

  constructor(options: PackageJsonPluginOptions) {
    this.#pathUtils = new RootPathUtils(options.rootDir);
  }

  async initialize(opts: FileMapPluginInitOptions<null, void>): Promise<void> {
    this.#lookup = opts.files.lookup;
    this.#packages.clear();
    this.#nearestByDir.clear();
    for (const {baseName, canonicalPath} of opts.files.fileIterator({
      includeNodeModules: true,
      includeSymlinks: true,
    })) {
      if (baseName === PACKAGE_JSON) {
        this.#addPackageJson(canonicalPath);
      }
    }
  }

  assertValid(): void {}

  onChanged(changes: ReadonlyFileSystemChanges<?void>): void {
    let indexChanged = false;
    for (const [canonicalPath] of changes.removedFiles) {
      if (isPackageJson(canonicalPath)) {
        indexChanged = this.#removePackageJson(canonicalPath) || indexChanged;
      }
    }
    for (const [canonicalPath] of changes.addedFiles) {
      if (isPackageJson(canonicalPath)) {
        indexChanged = this.#addPackageJson(canonicalPath) || indexChanged;
      }
    }
    // A modified package.json changes its contents, not the index. A
    // modified symlink named package.json may now point at something else,
    // though, and only exists in the index if it points at a regular file.
    for (const [canonicalPath] of changes.modifiedFiles) {
      if (isPackageJson(canonicalPath)) {
        const wasIndexed = this.#removePackageJson(canonicalPath);
        const isIndexed = this.#addPackageJson(canonicalPath);
        indexChanged = indexChanged || wasIndexed !== isIndexed;
      }
    }
    // Adding or removing a package.json anywhere can change the answer for an
    // unbounded set of descendant directories. The memo is small (one entry
    // per queried directory) and rebuilds lazily, so clear it wholesale.
    if (indexChanged) {
      this.#nearestByDir = new Map();
    }
  }

  getSerializableSnapshot(): null {
    // Rebuilt from the file iterator on initialize, which is a single pass
    // over file names.
    return null;
  }

  getCacheKey(): string {
    return '';
  }

  getWorker(): ?FileMapPluginWorker {
    return null;
  }

  /**
   * The package scope of a path, which need not exist. A path that does not
   * exist takes the scope of its deepest existing ancestor, unless the first
   * missing segment is `node_modules`.
   */
  getPackageScopeOf(mixedPath: string): ?PackageScope {
    return this.getPackageScopeForLookup(mixedPath, this.#lookup(mixedPath));
  }

  /**
   * The package scope of a path from the result of looking it up, for callers
   * that have already performed the lookup. `mixedPath` must be the path
   * that was looked up.
   */
  getPackageScopeForLookup(
    mixedPath: string,
    lookup: PluginLookupResult<unknown>,
  ): ?PackageScope {
    let dir: string;
    let tail: string;
    if (lookup.exists && lookup.type === 'd') {
      // A directory is its own first candidate, even one named node_modules:
      // the scope of `foo/node_modules/bar` is `bar` if it has a package.json.
      dir = lookup.realPath;
      tail = '';
    } else {
      // A file takes the scope of its directory, and a missing path that of
      // its deepest existing ancestor with the rest of the path as its
      // subpath. Neither has a scope if that directory, or the first missing
      // segment, is node_modules.
      let realPath;
      if (lookup.exists) {
        realPath = lookup.realPath;
        tail = basenameOf(realPath);
      } else {
        realPath = lookup.missing;
        if (basenameOf(realPath) === NODE_MODULES) {
          return null;
        }
        tail = this.#missingTail(mixedPath, realPath);
      }
      const parent = parentOf(realPath);
      if (parent == null || basenameOf(parent) === NODE_MODULES) {
        return null;
      }
      dir = parent;
    }

    const {entry, relDir} = this.#nearestPackageOf(dir);
    if (entry == null) {
      return null;
    }
    return {
      packageJsonPath: entry.packageJsonPath,
      rootPath: entry.rootPath,
      packageRelativePath:
        relDir === '' ? tail : tail === '' ? relDir : relDir + SEP + tail,
    };
  }

  #nearestPackageOf(dir: string): NearestPackage {
    const memo = this.#nearestByDir;
    const memoized = memo.get(dir);
    if (memoized != null) {
      return memoized;
    }
    // Ascend until a package, a node_modules boundary, a memoized ancestor
    // or the filesystem root. `dir` itself is a candidate whatever its name;
    // an ancestor named node_modules is a boundary, never a candidate.
    const ancestors: Array<string> = [];
    let entry: PackageEntry | null = null;
    let current = dir;
    for (;;) {
      const packageHere = this.#packages.get(current);
      if (packageHere != null) {
        entry = packageHere;
        break;
      }
      const parent = parentOf(current);
      if (parent == null || basenameOf(parent) === NODE_MODULES) {
        break;
      }
      const memoizedParent = memo.get(parent);
      if (memoizedParent != null) {
        entry = memoizedParent.entry;
        break;
      }
      ancestors.push(parent);
      current = parent;
    }
    if (entry == null) {
      memo.set(dir, NO_PACKAGE);
      for (const ancestor of ancestors) {
        memo.set(ancestor, NO_PACKAGE);
      }
      return NO_PACKAGE;
    }
    const rootOffset = childOffset(entry.rootPath);
    const nearest = {entry, relDir: dir.slice(rootOffset)};
    memo.set(dir, nearest);
    for (const ancestor of ancestors) {
      memo.set(ancestor, {entry, relDir: ancestor.slice(rootOffset)});
    }
    return nearest;
  }

  /**
   * The subpath of `mixedPath` from its first missing segment onwards, given
   * `missing`, the real path of that segment. When the path is normal and
   * traverses no symlink, the missing segment's parent is a literal prefix of
   * the path. Otherwise, the deepest existing ancestor is the shortest prefix
   * of the path that resolves to that parent.
   */
  #missingTail(mixedPath: string, missing: string): string {
    let absolutePath = isAbsolute(mixedPath)
      ? mixedPath
      : this.#pathUtils.normalToAbsolute(
          this.#pathUtils.relativeToNormal(mixedPath),
        );
    if (absolutePath.includes(SEP + '.')) {
      absolutePath = path.normalize(absolutePath);
    }
    if (absolutePath.endsWith(SEP)) {
      absolutePath = absolutePath.slice(0, -1);
    }
    const existingDir = parentOf(missing) ?? missing;
    if (isChildOf(absolutePath, existingDir)) {
      return absolutePath.slice(childOffset(existingDir));
    }
    let sepIdx = IS_WIN32 ? absolutePath.indexOf(SEP) : 0;
    for (;;) {
      sepIdx = absolutePath.indexOf(SEP, sepIdx + 1);
      if (sepIdx === -1) {
        break;
      }
      const prefix = absolutePath.slice(0, sepIdx);
      const lookup = this.#lookup(prefix);
      if (
        lookup.exists &&
        lookup.type === 'd' &&
        lookup.realPath === existingDir
      ) {
        return absolutePath.slice(sepIdx + 1);
      }
    }
    return basenameOf(missing);
  }

  // Returns whether the index changed.
  #addPackageJson(canonicalPath: string): boolean {
    const absolutePath = this.#pathUtils.normalToAbsolute(canonicalPath);
    // The manifest may be a symlink, in which case it only counts if it
    // points at a regular file. Its scope is the directory containing the
    // link, as it is for Node.
    const lookup = this.#lookup(absolutePath);
    if (!lookup.exists || lookup.type !== 'f') {
      return false;
    }
    const rootPath = parentOf(absolutePath);
    if (rootPath == null) {
      return false;
    }
    this.#packages.set(rootPath, {packageJsonPath: absolutePath, rootPath});
    return true;
  }

  // Returns whether the index changed.
  #removePackageJson(canonicalPath: string): boolean {
    const rootPath = parentOf(this.#pathUtils.normalToAbsolute(canonicalPath));
    return rootPath != null && this.#packages.delete(rootPath);
  }
}

function isPackageJson(canonicalPath: string): boolean {
  return (
    canonicalPath.endsWith(PACKAGE_JSON) &&
    (canonicalPath.length === PACKAGE_JSON.length ||
      canonicalPath.charCodeAt(
        canonicalPath.length - PACKAGE_JSON.length - 1,
      ) === SEP_CODE)
  );
}

function basenameOf(absolutePath: string): string {
  return absolutePath.slice(absolutePath.lastIndexOf(SEP) + 1);
}

/**
 * The parent of an absolute path, or null at a filesystem root. Filesystem
 * roots keep their trailing separator ('/', 'C:\', '\\server\share\'), as
 * `RootPathUtils.normalToAbsolute` produces them.
 */
function parentOf(absolutePath: string): ?string {
  const sepIdx = absolutePath.lastIndexOf(SEP);
  if (
    sepIdx > 0 &&
    sepIdx < absolutePath.length - 1 &&
    absolutePath.charCodeAt(sepIdx - 1) !== COLON_CODE &&
    !(IS_WIN32 && absolutePath.startsWith('\\\\'))
  ) {
    return absolutePath.slice(0, sepIdx);
  }
  const parent = path.dirname(absolutePath);
  return parent === absolutePath ? null : parent;
}

/**
 * The offset of a child's basename within its absolute path, given the
 * absolute path of the parent directory.
 */
function childOffset(parentPath: string): number {
  return parentPath.endsWith(SEP) ? parentPath.length : parentPath.length + 1;
}

function isChildOf(absolutePath: string, parentPath: string): boolean {
  return (
    absolutePath.length > parentPath.length &&
    absolutePath.startsWith(parentPath) &&
    (parentPath.endsWith(SEP) ||
      absolutePath.charCodeAt(parentPath.length) === SEP_CODE)
  );
}

function isAbsolute(mixedPath: string): boolean {
  return IS_WIN32
    ? path.isAbsolute(mixedPath)
    : mixedPath.charCodeAt(0) === SEP_CODE;
}
