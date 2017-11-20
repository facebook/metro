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

const fs = require('fs-extra');
const path = require('path');

import type {ConfigT} from './Config';

const METRO_CONFIG_FILENAME = 'metro.config.js';

exports.findMetroConfig = async function(
  filename: ?string,
): Promise<$Shape<ConfigT>> {
  if (filename) {
    // $FlowFixMe: We want this require to be dynamic
    return require(path.resolve(process.cwd(), filename));
  } else {
    let previous;
    let current = process.cwd();

    do {
      const filename = path.join(current, METRO_CONFIG_FILENAME);

      if (fs.existsSync(filename)) {
        // $FlowFixMe: We want this require to be dynamic
        return require(filename);
      }

      previous = current;
      current = path.dirname(current);
    } while (previous !== current);

    return {};
  }
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
