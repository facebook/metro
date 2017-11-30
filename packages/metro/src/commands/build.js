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

const {fetchMetroConfig, makeAsyncCommand} = require('../cli-utils');

import typeof Yargs from 'yargs';

exports.command = 'build <entry>';

exports.builder = (yargs: Yargs) => {
  yargs.option('project-roots', {
    alias: 'P',
    type: 'string',
    array: true,
  });
  yargs.option('out', {alias: 'O', type: 'string', demandOption: true});

  yargs.option('platform', {alias: 'p', type: 'string'});
  yargs.option('output-type', {alias: 't', type: 'string'});

  yargs.option('max-workers', {
    alias: 'j',
    type: 'number',
    default: Math.max(1, Math.floor(os.cpus().length)),
  });

  yargs.option('optimize', {alias: 'z', type: 'boolean'});
  yargs.option('dev', {alias: 'g', type: 'boolean'});

  yargs.option('source-map', {type: 'boolean'});
  yargs.option('source-map-url', {type: 'string'});

  yargs.option('legacy-bundler', {type: 'boolean'});

  yargs.option('config', {alias: 'c', type: 'string'});

  // Deprecated
  yargs.option('reset-cache', {type: 'boolean', describe: null});
};

// eslint-disable-next-line no-unclear-flowtypes
exports.handler = makeAsyncCommand(async (argv: any) => {
  const config = await fetchMetroConfig(argv.config);
  await MetroApi.runBuild({...argv, config});
});
