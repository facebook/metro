/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 *
 */

declare function getPlatformExtension(
  file: string,
  platforms: ReadonlySet<string>,
): null | undefined | string;
export default getPlatformExtension;
