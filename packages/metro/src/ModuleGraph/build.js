/**
 * Copyright (c) 2016-present, Facebook, Inc.
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

const defaults = require('../defaults');
const virtualModule = require('./module').virtual;
const getPreludeCode = require('../lib/getPreludeCode');

import type {BuildResult, GraphFn, PostProcessModules} from './types.flow';

type BuildOptions = {|
  +entryPointPaths: Iterable<string>,
  +getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,
  +graphFn: GraphFn,
  +optimize: boolean,
  +platform: string,
  +postProcessModules: PostProcessModules,
  +translateDefaultsPath: string => string,
|};

async function build(options: BuildOptions): Promise<BuildResult> {
  const {
    entryPointPaths,
    getPolyfills,
    graphFn,
    optimize,
    platform,
    postProcessModules,
    translateDefaultsPath,
  } = options;
  const graphOptions = {optimize};

  const graphWithOptions = entry => graphFn(entry, platform, graphOptions);
  const graphOnlyModules = async m => (await graphWithOptions(m)).modules;

  const [graph, moduleSystem, polyfills] = await Promise.all([
    (async () => {
      const result = await graphWithOptions(entryPointPaths);
      const {modules, entryModules} = result;
      const prModules = postProcessModules(modules, [...entryPointPaths]);
      return {modules: prModules, entryModules};
    })(),
    graphOnlyModules([translateDefaultsPath(defaults.moduleSystem)]),
    graphOnlyModules(getPolyfills({platform}).map(translateDefaultsPath)),
  ]);

  const {entryModules} = graph;
  const preludeScript = virtualModule(getPreludeCode({isDev: !optimize}));
  const prependedScripts = [preludeScript, ...moduleSystem, ...polyfills];
  return {
    entryModules,
    modules: [...prependedScripts, ...graph.modules],
    prependedScripts,
  };
}

module.exports = build;
