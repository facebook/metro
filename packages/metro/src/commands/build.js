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

import type {RunBuildOptions} from '../index';
import type {CustomTransformOptions} from 'metro-babel-transformer';
import type {CustomResolverOptions} from 'metro-resolver';
import type {ModuleObject} from 'yargs';
import typeof Yargs from 'yargs';

import parseKeyValueParamArray from '../cli/parseKeyValueParamArray';

const {makeAsyncCommand} = require('../cli-utils');
const TerminalReporter = require('../lib/TerminalReporter');
const {loadConfig} = require('metro-config');
const {Terminal} = require('metro-core');

const term = new Terminal(process.stdout);
const updateReporter = new TerminalReporter(term);

type Args = $ReadOnly<{
  config?: string,
  dev?: boolean,
  entry: string,
  legacyBundler?: boolean,
  maxWorkers?: number,
  minify?: boolean,
  out: string,
  outputType?: string,
  platform?: string,
  projectRoots?: $ReadOnlyArray<string>,
  resetCache?: boolean,
  sourceMap?: boolean,
  sourceMapUrl?: string,
  transformOption: CustomTransformOptions,
  resolverOption: CustomResolverOptions,
}>;

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

    yargs.option('transform-option', {
      type: 'string',
      array: true,
      alias: 'transformer-option',
      coerce: (parseKeyValueParamArray: $FlowFixMe),
      describe:
        'Custom transform options of the form key=value. URL-encoded. May be specified multiple times.',
    });

    yargs.option('resolver-option', {
      type: 'string',
      array: true,
      coerce: (parseKeyValueParamArray: $FlowFixMe),
      describe:
        'Custom resolver options of the form key=value. URL-encoded. May be specified multiple times.',
    });

    // Deprecated
    yargs.option('reset-cache', {type: 'boolean'});
  },

  handler: makeAsyncCommand(async (argv: Args) => {
    const config = await loadConfig(argv);
    const options: RunBuildOptions = {
      entry: argv.entry,
      dev: argv.dev,
      out: argv.out,
      minify: argv.minify,
      platform: argv.platform,
      sourceMap: argv.sourceMap,
      sourceMapUrl: argv.sourceMapUrl,
      customResolverOptions: argv.resolverOption,
      customTransformOptions: argv.transformOption,
    };

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
            customResolverOptions: options.customResolverOptions ?? {},
            customTransformOptions: options.customTransformOptions ?? {},
            dev: !!options.dev,
            entryFile: options.entry,
            minify: !!options.minify,
            platform: options.platform,
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
