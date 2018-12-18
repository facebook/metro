/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const denodeify = require('denodeify');
const fs = require('fs');
const path = require('path');
const {loadConfig} = require('metro-config');

const {getOrderedDependencyPaths} = require('../legacy');
const {makeAsyncCommand} = require('../cli-utils');

import typeof Yargs from 'yargs';

async function dependencies(args: any, config: any) {
  const rootModuleAbsolutePath = args.entryFile;
  if (!fs.existsSync(rootModuleAbsolutePath)) {
    return Promise.reject(
      new Error(`File ${rootModuleAbsolutePath} does not exist`),
    );
  }

  config.cacheStores = [];

  const relativePath = path.relative(
    config.projectRoot,
    rootModuleAbsolutePath,
  );

  const options = {
    platform: args.platform,
    entryFile: relativePath,
    dev: args.dev,
    minify: false,
    generateSourceMaps: !args.dev,
  };

  const writeToFile = args.output;
  const outStream = writeToFile
    ? fs.createWriteStream(args.output)
    : process.stdout;

  const deps = await getOrderedDependencyPaths(config, options);

  deps.forEach(modulePath => {
    // Temporary hack to disable listing dependencies not under this directory.
    // Long term, we need either
    // (a) JS code to not depend on anything outside this directory, or
    // (b) Come up with a way to declare this dependency in Buck.
    const isInsideProjectRoots =
      config.watchFolders.filter(root => modulePath.startsWith(root)).length >
      0;
    if (isInsideProjectRoots) {
      outStream.write(modulePath + '\n');
    }
  });
  return writeToFile
    ? denodeify(outStream.end).bind(outStream)()
    : Promise.resolve();
}

module.exports = () => ({
  command: 'dependencies',
  description: 'List dependencies',
  builder: (yargs: Yargs) => {
    yargs.option('entry-file', {type: 'string', demandOption: true});
    yargs.option('output', {type: 'string'});
    yargs.option('platform', {type: 'string'});
    yargs.option('transformer', {type: 'string'});
    yargs.option('max-workers', {type: 'number'});
    yargs.option('dev', {type: 'boolean'});
    yargs.option('verbose', {type: 'boolean'});
  },
  handler: makeAsyncCommand(async (argv: any) => {
    const config = await loadConfig(argv);
    await dependencies(argv, config);
  }),
});
