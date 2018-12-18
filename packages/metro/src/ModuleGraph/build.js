/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */
'use strict';

const defaults = require('metro-config/src/defaults/defaults');
const virtualModule = require('./module').virtual;
const getPreludeCode = require('../lib/getPreludeCode');

import type {BuildResult, GraphFn, PostProcessModules} from './types.flow';

type BuildOptions = {|
  +entryPointPaths: Iterable<string>,
  +framework: string,
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

  const graphOnlyModules = async m => (await graphFn(m)).modules;

  const [graph, moduleSystem, polyfills] = await Promise.all([
    (async () => {
      const result = await graphFn(entryPointPaths);
      const {modules, entryModules} = result;
      const prModules = postProcessModules(modules, [...entryPointPaths]);
      return {modules: prModules, entryModules};
    })(),
    graphOnlyModules([translateDefaultsPath(defaults.moduleSystem)]),
    graphOnlyModules(getPolyfills({platform}).map(translateDefaultsPath)),
  ]);

  const {entryModules} = graph;
  const preludeScript = virtualModule(
    getPreludeCode({
      extraVars: {
        __FRAMEWORK__: options.framework,
      },
      isDev: !optimize,
    }),
    '/<generated>/prelude.js',
  );
  const prependedScripts = [preludeScript, ...moduleSystem, ...polyfills];
  return {
    entryModules,
    modules: [...prependedScripts, ...graph.modules],
  };
}

module.exports = build;
