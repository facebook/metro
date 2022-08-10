/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

import type {RunBuildOptions} from '../index';
import type {YargArguments} from 'metro-config/src/configTypes.flow';
import typeof Yargs from 'yargs';
import type {ModuleObject} from 'yargs';

const {makeAsyncCommand} = require('../cli-utils');
const TerminalReporter = require('../lib/TerminalReporter');
const {loadConfig} = require('metro-config');
const {Terminal} = require('metro-core');

const term = new Terminal(process.stdout);
const updateReporter = new TerminalReporter(term);

module.exports = (): {
  ...ModuleObject,
  handler: Function,
} => ({
  command: 'build <entry>',
  desc: 'Generates a JavaScript bundle containing the specified entrypoint and its descendants',

  builder: (yargs: Yargs): void => {
    yargs.option('project-roots', {
      alias: 'P',
      type: 'string',
      array: true,
    });
    yargs.option('out', {alias: 'O', type: 'string', demandOption: true});

    yargs.option('platform', {alias: 'p', type: 'string'});
    yargs.option('output-type', {alias: 't', type: 'string'});

    yargs.option('max-workers', {alias: 'j', type: 'number'});

    yargs.option('minify', {alias: 'z', type: 'boolean'});
    yargs.option('dev', {alias: 'g', type: 'boolean'});

    yargs.option('source-map', {type: 'boolean'});
    yargs.option('source-map-url', {type: 'string'});

    yargs.option('legacy-bundler', {type: 'boolean'});

    yargs.option('config', {alias: 'c', type: 'string'});

    // Deprecated
    yargs.option('reset-cache', {type: 'boolean'});
  },

  handler: makeAsyncCommand(async (argv: YargArguments) => {
    const config = await loadConfig(argv);
    // $FlowExpectedError YargArguments and RunBuildOptions are used interchangeable but their types are not yet compatible
    const options = (argv: RunBuildOptions);

    // Inline require() to avoid circular dependency with ../index
    const MetroApi = require('../index');

    await MetroApi.runBuild(config, {
      ...options,
      onBegin: (): void => {
        updateReporter.update({
          buildID: '$',
          type: 'bundle_build_started',
          bundleDetails: {
            bundleType: 'Bundle',
            dev: !!options.dev,
            entryFile: options.entry,
            minify: !!options.minify,
            platform: options.platform,
            // Bytecode bundles in Metro are not meant for production use. Instead,
            // the Hermes Bytecode Compiler should be invoked on the resulting JS bundle from Metro.
            runtimeBytecodeVersion: null,
          },
        });
      },
      onProgress: (
        transformedFileCount: number,
        totalFileCount: number,
      ): void => {
        updateReporter.update({
          buildID: '$',
          type: 'bundle_transform_progressed',
          transformedFileCount,
          totalFileCount,
        });
      },
      onComplete: (): void => {
        updateReporter.update({
          buildID: '$',
          type: 'bundle_build_done',
        });
      },
    });
  }),
});
