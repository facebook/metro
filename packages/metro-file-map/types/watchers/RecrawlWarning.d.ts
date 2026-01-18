/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

/**
 * Originally vendored from
 * https://github.com/amasad/sane/blob/64ff3a870c42e84f744086884bf55a4f9c22d376/src/utils/recrawl-warning-dedupe.js
 */

declare class RecrawlWarning {
  static RECRAWL_WARNINGS: Array<RecrawlWarning>;
  static REGEXP: RegExp;
  root: string;
  count: number;
  constructor(root: string, count: number);
  static findByRoot(root: string): null | undefined | RecrawlWarning;
  static isRecrawlWarningDupe(warningMessage: unknown): boolean;
}
export default RecrawlWarning;
