/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const yargs = require('yargs');

const {runInspectorProxy} = require('./index');

yargs.option('port', {
  alias: 'p',
  describe: 'port to run inspector proxy on',
  type: 'number',
  default: 8081,
});

runInspectorProxy((yargs.argv.port: any));
