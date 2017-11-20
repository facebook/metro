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

const {findMetroConfig, makeAsyncCommand} = require('../cli-utils');

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

  yargs.option('legacy-bundler', {type: 'boolean'});

  yargs.option('config', {alias: 'c', type: 'string'});
};

// eslint-disable-next-line no-unclear-flowtypes
exports.handler = makeAsyncCommand(async (argv: any) => {
  argv.config = await findMetroConfig(argv.config);

  await MetroApi.runServer({
    ...argv,
    onReady(server) {
      console.log(
        `The HTTP server is ready to accept requests on ${server.address()
          .address}:${server.address().port}`,
      );
    },
  });
});
