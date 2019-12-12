/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 */

'use strict';

const TerminalReporter = require('metro/src/lib/TerminalReporter');

const getDefaultConfig = require('../defaults');
const getMaxWorkers = require('metro/src/lib/getMaxWorkers');
const path = require('path');
const prettyFormat = require('pretty-format');

const {convertOldToNew} = require('../convertConfig');
const {DEFAULT_METRO_MINIFIER_PATH} = require('../defaults/defaults');
const {DEFAULT} = require('../oldConfig');
const {Terminal} = require('metro-core');

describe('convertConfig', () => {
  let warningMessages = [];

  beforeEach(() => {
    warningMessages = [];

    console.warn = jest.fn(warn => {
      warningMessages.push(warn);
    });
  });

  it('converts the old default config exactly to the new default config', async () => {
    // This is a test we can remove later. It checks if the converted default configuration
    // of the old configuration is equal to the default new config.
    const defaultConfig = await getDefaultConfig(
      path.join(__dirname, '..', '..', '..', '..'),
    );

    const convertedConfig = await convertOldToNew({
      config: DEFAULT,
      resetCache: false,
      maxWorkers: getMaxWorkers(),
      minifierPath: DEFAULT_METRO_MINIFIER_PATH,
      port: 8080,
      reporter: new TerminalReporter(new Terminal(process.stdout)),
      watch: true,
    });

    expect(prettyFormat(convertedConfig)).toEqual(prettyFormat(defaultConfig));
  });
});
