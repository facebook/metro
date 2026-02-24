/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<091df9100cc8f841af449036a548f6aa>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-resolver/src/utils/toPosixPath.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

/**
 * Replace path separators in the passed string to coerce to a POSIX path. This
 * is a no-op on POSIX systems.
 */
declare function toPosixPath(relativePathOrSpecifier: string): string;
export default toPosixPath;
