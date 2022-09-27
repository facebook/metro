/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

'use strict';

const {runInspectorProxy} = require('./index');
const yargs = require('yargs');

const argv = yargs
  .option('port', {
    alias: 'p',
    describe: 'port to run inspector proxy on',
    type: 'number',
    default: 8081,
  })
  .option('root', {
    alias: 'r',
    describe: 'root folder of metro project',
    type: 'string',
    default: '',
  })
  .parseSync();

runInspectorProxy((argv.port: any), (argv.root: any));
