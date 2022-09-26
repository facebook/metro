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

export default async function checkWatchmanCapabilities(
  requiredCapabilities: $ReadOnlyArray<string>,
): Promise<void> {
  let rawResponse;
  try {
    const result = await promisify(execFile)('watchman', [
      'list-capabilities',
      '--output-encoding=json',
      '--no-pretty',
      '--no-spawn', // The client can answer this, so don't spawn a server
    ]);
    rawResponse = result.stdout;
  } catch (e) {
    if (e?.code === 'ENOENT') {
      throw new Error('Watchman is not installed or not available on PATH');
    }
    throw e;
  }

  let parsedResponse;
  try {
    parsedResponse = JSON.parse(rawResponse);
  } catch {
    throw new Error(
      'Failed to parse response from `watchman list-capabilities`',
    );
  }
  if (
    typeof parsedResponse.version !== 'string' ||
    !Array.isArray(parsedResponse.capabilities)
  ) {
    throw new Error('Unexpected response from `watchman list-capabilities`');
  }

  const capabilities = new Set(parsedResponse.capabilities);
  const missingCapabilities = requiredCapabilities.filter(
    requiredCapability => !capabilities.has(requiredCapability),
  );
  if (missingCapabilities.length > 0) {
    throw new Error(
      `The installed version of Watchman (${
        parsedResponse.version
      }) is missing required capabilities: ${missingCapabilities.join(', ')}`,
    );
  }
}
