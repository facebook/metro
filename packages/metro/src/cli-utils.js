/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @format
 */

'use strict';

const Config = require('./Config');

const fs = require('fs-extra');
const path = require('path');

import type {ConfigT} from './Config';

const METRO_CONFIG_FILENAME = 'metro.config.js';

type MetroConfigSearchOptions = {|
  cwd?: string,
  basename?: string,
|};

exports.watchFile = async function(
  filename: string,
  callback: () => *,
): Promise<void> {
  fs.watchFile(filename, () => {
    callback();
  });

  await callback();
};

exports.findMetroConfig = async function(
  filename: ?string,
  {
    cwd = process.cwd(),
    basename = METRO_CONFIG_FILENAME,
  }: MetroConfigSearchOptions = {},
): Promise<?string> {
  if (filename) {
    return path.resolve(cwd, filename);
  } else {
    let previous;
    let current = cwd;

    do {
      const filename = path.join(current, basename);

      if (fs.existsSync(filename)) {
        return filename;
      }

      previous = current;
      current = path.dirname(current);
    } while (previous !== current);

    return null;
  }
};

exports.fetchMetroConfig = async function(
  filename: ?string,
  // $FlowFixMe: This is a known Flow issue where it doesn't detect that an empty object is a valid value for a strict shape where all the members are optionals
  searchOptions: MetroConfigSearchOptions = {},
): Promise<ConfigT> {
  const location = await exports.findMetroConfig(filename, searchOptions);

  // $FlowFixMe: We want this require to be dynamic
  const config = location ? require(location) : null;

  // $FlowFixMe: For some reason, Flow doesn't recognize the return value as a promise
  return config ? Config.normalize(config) : Config.DEFAULT;
};

// eslint-disable-next-line no-unclear-flowtypes
exports.makeAsyncCommand = (command: (argv: any) => Promise<*>) => (
  // eslint-disable-next-line no-unclear-flowtypes
  argv: any,
) => {
  Promise.resolve(command(argv)).catch(error => {
    console.error(error.stack);
    process.exitCode = 1;
  });
};
