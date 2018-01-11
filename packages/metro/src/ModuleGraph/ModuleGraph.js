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

export type BuildFn = (
  entryPoints: Iterable<string>,
  options: BuildOptions,
) => Promise<BuildResult>;

type BuildOptions = {|
  getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,
  optimize: boolean,
  platform: string,
|};

exports.createBuildSetup = (
  graphFn: GraphFn,
  postProcessModules: PostProcessModules,
  translateDefaultsPath: string => string = x => x,
): BuildFn => async (entryPoints, options) => {
  const {
    getPolyfills = ({platform}) => [],
    optimize = false,
    platform = defaults.platforms[0],
  } = options;
  const graphOptions = {optimize};

  const graphWithOptions = entry => graphFn(entry, platform, graphOptions);
  const graphOnlyModules = async m => (await graphWithOptions(m)).modules;

  const [graph, moduleSystem, polyfills] = await Promise.all([
    (async () => {
      const result = await graphWithOptions(entryPoints);
      const {modules, entryModules} = result;
      const prModules = postProcessModules(modules, [...entryPoints]);
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
};
