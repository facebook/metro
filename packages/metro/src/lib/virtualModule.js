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

import {normalizePathSeparatorsToPosix} from './pathUtils';
import path from 'node:path';

/**
 * The namespace of virtual module paths in the graph. A virtual module's path
 * is this prefix followed by its absolute virtual path, so it can never equal
 * the absolute path of a real file, and anything that mistakes it for one
 * fails rather than reading the wrong file.
 */
const VIRTUAL_MODULE_NAMESPACE = 'metro-virtual:';

/**
 * The leading URL path segment for virtual modules, following the bracketed
 * convention of `[metro-watchFolders]` in server URLs.
 */
const VIRTUAL_MODULE_URL_SEGMENT = '[metro-virtual]';

/**
 * The graph path of the virtual module at `virtualPath`. A virtual path names
 * exactly one module: the same virtual path with different source is a
 * modification of that module, as an edit to a file is.
 */
export function deriveVirtualModulePath(virtualPath: string): string {
  return VIRTUAL_MODULE_NAMESPACE + virtualPath;
}

export function isVirtualModulePath(modulePath: string): boolean {
  return modulePath.startsWith(VIRTUAL_MODULE_NAMESPACE);
}

/**
 * The path a module is resolved from and transformed as. For a virtual module
 * this is its virtual path, so imports inside it resolve from that path's
 * directory and path-based transform configuration, extension checks included,
 * behaves as for a file at that path. Otherwise it is the module path itself.
 */
export function getModuleSourcePath(modulePath: string): string {
  return isVirtualModulePath(modulePath)
    ? modulePath.slice(VIRTUAL_MODULE_NAMESPACE.length)
    : modulePath;
}

/**
 * A module path for display, as in development module names: relative to
 * `rootDir` with POSIX separators, and namespaced if the module is virtual.
 */
export function getModuleDisplayPath(
  modulePath: string,
  rootDir: string,
): string {
  const relativePath = normalizePathSeparatorsToPosix(
    path.relative(rootDir, getModuleSourcePath(modulePath)),
  );
  return isVirtualModulePath(modulePath)
    ? VIRTUAL_MODULE_NAMESPACE + relativePath
    : relativePath;
}

/**
 * A module's URL pathname, given the derivation used for files at the call
 * site. A virtual module's pathname is its virtual path's, under a leading
 * `[metro-virtual]` segment, so it never equals the pathname of a real file,
 * including the file it may be anchored at.
 */
export function getModuleUrlPathname(
  modulePath: string,
  urlPathnameOfFilePath: (filePath: string) => string,
): string {
  if (!isVirtualModulePath(modulePath)) {
    return urlPathnameOfFilePath(modulePath);
  }
  const filePathname = urlPathnameOfFilePath(getModuleSourcePath(modulePath));
  return (
    '/' +
    VIRTUAL_MODULE_URL_SEGMENT +
    (filePathname.startsWith('/') ? '' : '/') +
    filePathname
  );
}
