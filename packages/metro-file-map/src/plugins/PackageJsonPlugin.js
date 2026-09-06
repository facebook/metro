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
  // Absolute, real directory path → its nearest package
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
        this.#syncPackageJson(canonicalPath);
      }
    }
  }

  assertValid(): void {}

  onChanged(changes: ReadonlyFileSystemChanges<?void>): void {
    let indexChanged = false;
    for (const changedFiles of [
      changes.addedFiles,
      changes.modifiedFiles,
      changes.removedFiles,
    ]) {
      for (const [canonicalPath] of changedFiles) {
        if (path.basename(canonicalPath) === PACKAGE_JSON) {
          indexChanged = this.#syncPackageJson(canonicalPath) || indexChanged;
        }
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
    const lookup = this.#lookup(mixedPath);
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
        tail = path.basename(realPath);
      } else {
        realPath = lookup.missing;
        if (path.basename(realPath) === NODE_MODULES) {
          return null;
        }
        tail = this.#missingTail(mixedPath, realPath);
      }
      const parent = parentOf(realPath);
      if (parent == null || path.basename(parent) === NODE_MODULES) {
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
      // Either may be empty, in which case the other is the whole path
      packageRelativePath:
        relDir !== '' && tail !== '' ? relDir + SEP + tail : relDir + tail,
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
    const visited = [dir];
    let entry: PackageEntry | null = null;
    let current = dir;
    for (;;) {
      const packageHere = this.#packages.get(current);
      if (packageHere != null) {
        entry = packageHere;
        break;
      }
      const parent = parentOf(current);
      if (parent == null || path.basename(parent) === NODE_MODULES) {
        break;
      }
      const memoizedParent = memo.get(parent);
      if (memoizedParent != null) {
        entry = memoizedParent.entry;
        break;
      }
      visited.push(parent);
      current = parent;
    }
    const packageEntry = entry;
    const nearestOf = (visitedDir: string): NearestPackage =>
      packageEntry == null
        ? NO_PACKAGE
        : {
            entry: packageEntry,
            relDir: path.relative(packageEntry.rootPath, visitedDir),
          };
    for (const visitedDir of visited) {
      memo.set(visitedDir, nearestOf(visitedDir));
    }
    return nearestOf(dir);
  }

  /**
   * The subpath of `mixedPath` from its first missing segment onwards, given
   * `missing`, the real path of that segment.
   */
  #missingTail(mixedPath: string, missing: string): string {
    const absolutePath = this.#toAbsolute(mixedPath);
    const existingDir = path.dirname(missing);
    // When the path traverses no symlink, the deepest existing directory is
    // a literal prefix of the path. Filesystem roots keep their separator.
    const existingDirPrefix = existingDir.endsWith(SEP)
      ? existingDir
      : existingDir + SEP;
    if (absolutePath.startsWith(existingDirPrefix)) {
      return absolutePath.slice(existingDirPrefix.length);
    }
    // Otherwise it is the prefix of the path that resolves to that directory,
    // which is followed by a segment with the missing segment's name.
    const missingSegment = SEP + path.basename(missing);
    for (
      let idx = absolutePath.lastIndexOf(missingSegment);
      idx > 0;
      idx = absolutePath.lastIndexOf(missingSegment, idx - 1)
    ) {
      const end = idx + missingSegment.length;
      if (end !== absolutePath.length && absolutePath[end] !== SEP) {
        continue;
      }
      const prefix = this.#lookup(absolutePath.slice(0, idx));
      if (
        prefix.exists &&
        prefix.type === 'd' &&
        prefix.realPath === existingDir
      ) {
        return absolutePath.slice(idx + 1);
      }
    }
    return path.basename(missing);
  }

  // The absolute, normal form of a path as accepted by `lookup`: absolute or
  // root-relative, possibly with redundant indirections.
  #toAbsolute(mixedPath: string): string {
    const isAbsolute = path.isAbsolute(mixedPath);
    if (isAbsolute && !mixedPath.includes(SEP + '.')) {
      return mixedPath.endsWith(SEP) ? mixedPath.slice(0, -1) : mixedPath;
    }
    return this.#pathUtils.normalToAbsolute(
      isAbsolute
        ? this.#pathUtils.absoluteToNormal(mixedPath)
        : this.#pathUtils.relativeToNormal(mixedPath),
    );
  }

  /**
   * Brings the index in line with the file map for a path named
   * `package.json`: indexed if it is, or links to, a regular file, otherwise
   * not. Returns whether the index changed.
   */
  #syncPackageJson(canonicalPath: string): boolean {
    const packageJsonPath = this.#pathUtils.normalToAbsolute(canonicalPath);
    // The scope of a symlinked manifest is the directory containing the
    // link, as it is for Node.
    const rootPath = path.dirname(packageJsonPath);
    const lookup = this.#lookup(packageJsonPath);
    if (!lookup.exists || lookup.type !== 'f') {
      return this.#packages.delete(rootPath);
    }
    if (this.#packages.has(rootPath)) {
      return false;
    }
    this.#packages.set(rootPath, {packageJsonPath, rootPath});
    return true;
  }
}

// The parent of an absolute path, or null at a filesystem root
function parentOf(absolutePath: string): ?string {
  const parent = path.dirname(absolutePath);
  return parent === absolutePath ? null : parent;
}
