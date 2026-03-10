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

import type {PackageCache} from '../PackageCache';
import type {FileSystem, InvalidationData} from 'metro-file-map';
import type {
  DoesFileExist,
  FileSystemLookup,
  ResolveAsset,
} from 'metro-resolver';
import type {PackageForModule, PackageJson} from 'metro-resolver/private/types';

import path from 'path';

/**
 * Wraps resolver I/O to track file system observations for incremental
 * resolution invalidation. Created once per ModuleResolver and reused across
 * resolutions. Per-resolution state is managed via startTracking(), which
 * returns a fresh InvalidationData that the instance writes to until the
 * next call to startTracking() (or if tracking is not active, no-ops).
 *
 * By wrapping at this level (rather than downstream of DependencyGraph's
 * fileSystemLookup wrapper), we have access to full LookupResult data from
 * TreeFS, including `missing` (canonical path of the first missing segment)
 * and `links` (symlinks traversed).
 */
export default class TrackedFileAccess {
  #fileSystem: FileSystem;
  #projectRoot: string;
  #packageCache: PackageCache;
  #getHasteModulePath: (name: string, platform: ?string) => ?string;
  #getHastePackagePath: (name: string, platform: ?string) => ?string;
  #assetResolutions: ReadonlyArray<string>;

  #currentTarget: ?InvalidationData = null;
  #platform: string | null = null;

  constructor(
    fileSystem: FileSystem,
    projectRoot: string,
    packageCache: PackageCache,
    getHasteModulePath: (name: string, platform: ?string) => ?string,
    getHastePackagePath: (name: string, platform: ?string) => ?string,
    assetResolutions: ReadonlyArray<string>,
  ) {
    this.#fileSystem = fileSystem;
    this.#projectRoot = projectRoot;
    this.#packageCache = packageCache;
    this.#getHasteModulePath = getHasteModulePath;
    this.#getHastePackagePath = getHastePackagePath;
    this.#assetResolutions = assetResolutions;
  }

  /**
   * Begin tracking for a new resolution. Returns a fresh InvalidationData
   * that will be populated by subsequent calls to wrapped methods.
   */
  startTracking(platform: string | null): InvalidationData {
    const target: InvalidationData = {
      existence: new Set(),
      modification: new Set(),
      haste: new Set(),
    };
    this.#currentTarget = target;
    this.#platform = platform;
    return target;
  }

  #toCanonical(absolutePath: string): string {
    return path.relative(this.#projectRoot, absolutePath);
  }

  doesFileExist: DoesFileExist = (filePath: string) => {
    const result = this.#fileSystem.exists(filePath);
    const target = this.#currentTarget;
    if (target != null) {
      target.existence.add(this.#toCanonical(filePath));
    }
    return result;
  };

  fileSystemLookup: FileSystemLookup = (
    absoluteOrProjectRelativePath: string,
  ) => {
    const result = this.#fileSystem.lookup(absoluteOrProjectRelativePath);
    const target = this.#currentTarget;
    if (target != null) {
      if (result.exists) {
        target.existence.add(this.#toCanonical(result.realPath));
        for (const link of result.links) {
          target.modification.add(this.#toCanonical(link));
        }
      } else {
        target.existence.add(this.#toCanonical(result.missing));
        for (const link of result.links) {
          target.modification.add(this.#toCanonical(link));
        }
      }
    }
    if (result.exists) {
      return {
        exists: true,
        realPath: result.realPath,
        type: result.type,
      };
    }
    return {exists: false};
  };

  resolveAsset: ResolveAsset = (
    dirPath: string,
    assetName: string,
    extension: string,
  ) => {
    const basePath = dirPath + path.sep + assetName;
    const assets = [
      basePath + extension,
      ...this.#assetResolutions.map(
        resolution => basePath + '@' + resolution + 'x' + extension,
      ),
    ]
      .map(candidate => this.fileSystemLookup(candidate).realPath)
      .filter(Boolean);

    return assets.length ? assets : null;
  };

  getPackage: (packageJsonPath: string) => ?PackageJson = (
    packageJsonPath: string,
  ) => {
    try {
      const result = this.#packageCache.getPackage(packageJsonPath).read();
      const target = this.#currentTarget;
      if (target != null && result != null) {
        const canonical = this.#toCanonical(packageJsonPath);
        target.modification.add(canonical);
        target.existence.delete(canonical);
      }
      return result;
    } catch (e) {
      return null;
    }
  };

  getPackageForModule: (absoluteModulePath: string) => ?PackageForModule = (
    absoluteModulePath: string,
  ) => {
    let result;
    try {
      result = this.#packageCache.getPackageOf(
        absoluteModulePath,
        this.#currentTarget,
      );
    } catch (e) {
      // Do nothing.
    }
    if (result != null) {
      const target = this.#currentTarget;
      if (target != null) {
        const canonical = this.#toCanonical(
          path.join(path.dirname(result.pkg.path), 'package.json'),
        );
        target.modification.add(canonical);
        target.existence.delete(canonical);
      }
      return {
        packageJson: result.pkg.read(),
        packageRelativePath: result.packageRelativePath,
        rootPath: path.dirname(result.pkg.path),
      };
    }
    return null;
  };

  resolveHasteModule: (name: string) => ?string = (name: string) => {
    const target = this.#currentTarget;
    if (target != null) {
      target.haste.add(name);
    }
    return this.#getHasteModulePath(name, this.#platform);
  };

  resolveHastePackage: (name: string) => ?string = (name: string) => {
    const target = this.#currentTarget;
    if (target != null) {
      target.haste.add(name);
    }
    return this.#getHastePackagePath(name, this.#platform);
  };
}
