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

const MetroApi = require('..');

const os = require('os');

const {
  findMetroConfig,
  fetchMetroConfig,
  watchFile,
  makeAsyncCommand,
} = require('../cli-utils');
const {promisify} = require('util');

import typeof Yargs from 'yargs';

exports.command = 'serve';

exports.builder = (yargs: Yargs) => {
  yargs.option('project-roots', {
    alias: 'P',
    type: 'string',
    array: true,
  });

  yargs.option('host', {alias: 'h', type: 'string', default: 'localhost'});
  yargs.option('port', {alias: 'p', type: 'number', default: 8080});

  yargs.option('max-workers', {
    alias: 'j',
    type: 'number',
    default: Math.max(1, Math.floor(os.cpus().length)),
  });

  yargs.option('secure', {type: 'boolean'});
  yargs.option('secure-key', {type: 'string'});
  yargs.option('secure-cert', {type: 'string'});

  yargs.option('hmr-enabled', {alias: 'hmr', type: 'boolean'});

  yargs.option('config', {alias: 'c', type: 'string'});

  // Deprecated
  yargs.option('reset-cache', {type: 'boolean', describe: null});
};

// eslint-disable-next-line no-unclear-flowtypes
exports.handler = makeAsyncCommand(async (argv: any) => {
  let server = null;
  let restarting = false;

  async function restart() {
    if (restarting) {
      return;
    } else {
      restarting = true;
    }

    if (server) {
      console.log('Configuration changed. Restarting the server...');
      await promisify(server.close).call(server);
    }

    const config = await fetchMetroConfig(argv.config);

    server = await MetroApi.runServer({
      ...argv,
      config,
    });

    restarting = false;
  }

  const metroConfigLocation = await findMetroConfig(argv.config);

  if (metroConfigLocation) {
    await watchFile(metroConfigLocation, restart);
  } else {
    await restart();
  }
});
