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
  const execFilePromise: (
    cmd: string,
    args: $ReadOnlyArray<string>,
  ) => Promise<{stdout: string}> = promisify(execFile);

  let rawResponse;
  try {
    const result = await execFilePromise('watchman', [
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
    parsedResponse = (JSON.parse(rawResponse): mixed);
  } catch {
    throw new Error(
      'Failed to parse response from `watchman list-capabilities`',
    );
  }

  if (
    parsedResponse == null ||
    typeof parsedResponse !== 'object' ||
    typeof parsedResponse.version !== 'string' ||
    !Array.isArray(parsedResponse.capabilities)
  ) {
    throw new Error('Unexpected response from `watchman list-capabilities`');
  }
  const version = parsedResponse.version;
  const capabilities = new Set(parsedResponse.capabilities);
  const missingCapabilities = requiredCapabilities.filter(
    requiredCapability => !capabilities.has(requiredCapability),
  );
  if (missingCapabilities.length > 0) {
    throw new Error(
      `The installed version of Watchman (${version}) is missing required capabilities: ${missingCapabilities.join(
        ', ',
      )}`,
    );
  }
}
