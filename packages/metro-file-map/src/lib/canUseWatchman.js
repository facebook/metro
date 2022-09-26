/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 */

import {execFile} from 'child_process';
import {promisify} from 'util';

export default async function canUseWatchman(): Promise<boolean> {
  try {
    await promisify(execFile)('watchman', ['--version']);
    return true;
  } catch {
    return false;
  }
}
