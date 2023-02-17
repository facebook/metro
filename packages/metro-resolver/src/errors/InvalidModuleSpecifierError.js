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

export default class InvalidModuleSpecifierError extends Error {
  /**
   * Either the import specifier read, or the absolute path of the module being
   * resolved (used when import specifier is externally remapped).
   */
  importSpecifier: string;

  /**
   * The description of the error cause.
   */
  reason: string;

  constructor(
    opts: $ReadOnly<{
      importSpecifier: string,
      reason: string,
    }>,
  ) {
    super(
      `Invalid import specifier ${opts.importSpecifier}.\nReason: ` +
        opts.reason,
    );
    Object.assign(this, opts);
  }
}
