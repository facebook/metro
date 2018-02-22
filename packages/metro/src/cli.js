#!/usr/bin/env node

/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const yargs = require('yargs');

const {attachMetroCli} = require('./index');

attachMetroCli(yargs.demandCommand(1)).argv;
