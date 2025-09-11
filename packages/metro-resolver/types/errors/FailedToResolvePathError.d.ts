/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {FileAndDirCandidates} from '../types';

declare class FailedToResolvePathError extends Error {
  candidates: FileAndDirCandidates;
  constructor(candidates: FileAndDirCandidates);
}
export default FailedToResolvePathError;
