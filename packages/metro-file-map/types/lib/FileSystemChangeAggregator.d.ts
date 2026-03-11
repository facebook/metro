/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<5feda1b197530a9a5fdbc57200633ac5>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/lib/FileSystemChangeAggregator.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {
  CanonicalPath,
  FileMetadata,
  FileSystemListener,
  ReadonlyFileSystemChanges,
} from '../flow-types';

export declare class FileSystemChangeAggregator implements FileSystemListener {
  directoryAdded(canonicalPath: CanonicalPath): void;
  directoryRemoved(canonicalPath: CanonicalPath): void;
  fileAdded(canonicalPath: CanonicalPath, data: FileMetadata): void;
  fileModified(
    canonicalPath: CanonicalPath,
    oldData: FileMetadata,
    newData: FileMetadata,
  ): void;
  fileRemoved(canonicalPath: CanonicalPath, data: FileMetadata): void;
  getSize(): number;
  getView(): ReadonlyFileSystemChanges<FileMetadata>;
  getMappedView<T>(
    metadataMapFn: (metadata: FileMetadata) => T,
  ): ReadonlyFileSystemChanges<T>;
}
