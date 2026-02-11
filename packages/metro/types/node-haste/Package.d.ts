/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {PackageJson} from 'metro-resolver/private/types';

declare class Package {
  path: string;
  _root: string;
  _content: null | undefined | PackageJson;
  constructor($$PARAM_0$$: {file: string});
  invalidate(): void;
  read(): PackageJson;
}
export default Package;
