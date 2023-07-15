/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

/**
 * Raised when package exports do not define or permit a target subpath in the
 * package for the given module.
 */
export default class PackagePathNotExportedError extends Error {}
