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

import type {BabelCoreOptions} from '@babel/core';
import type {FBSourceFunctionMap} from 'metro-source-map';

const {parseSync, transformFromAstSync} = require('@babel/core');
const HermesParser = require('hermes-parser');
const {generateFunctionMap} = require('metro-source-map');
const nullthrows = require('nullthrows');

export type CustomTransformOptions = {
  [string]: mixed,
  __proto__: null,
  ...
};

export type TransformProfile = 'default' | 'hermes-stable' | 'hermes-canary';

type BabelTransformerOptions = $ReadOnly<{
  customTransformOptions?: CustomTransformOptions,
  dev: boolean,
  enableBabelRCLookup?: boolean,
  enableBabelRuntime: boolean | string,
  extendsBabelConfigPath?: string,
  experimentalImportSupport?: boolean,
  hermesParser?: boolean,
  hot: boolean,
  inlineRequires: boolean,
  nonInlinedRequires?: $ReadOnlyArray<string>,
  minify: boolean,
  unstable_disableES6Transforms?: boolean,
  platform: ?string,
  projectRoot: string,
  publicPath: string,
  unstable_transformProfile?: TransformProfile,
  globalPrefix: string,
  ...
}>;

export type BabelTransformerArgs = $ReadOnly<{|
  filename: string,
  options: BabelTransformerOptions,
  plugins?: $PropertyType<BabelCoreOptions, 'plugins'>,
  src: string,
|}>;

export type BabelTransformer = {|
  transform: BabelTransformerArgs => {
    ast: BabelNodeFile,
    functionMap: ?FBSourceFunctionMap,
    ...
  },
  getCacheKey?: () => string,
|};

function transform({filename, options, plugins, src}: BabelTransformerArgs) {
  const OLD_BABEL_ENV = process.env.BABEL_ENV;
  process.env.BABEL_ENV = options.dev
    ? 'development'
    : process.env.BABEL_ENV || 'production';

  try {
    const babelConfig = {
      caller: {name: 'metro', bundler: 'metro', platform: options.platform},
      ast: true,
      babelrc: options.enableBabelRCLookup,
      code: false,
      highlightCode: true,
      filename,
      plugins,
      sourceType: 'module',
    };
    const sourceAst = options.hermesParser
      ? HermesParser.parse(src, {
          babel: true,
          sourceType: babelConfig.sourceType,
        })
      : parseSync(src, babelConfig);
    const {ast} = transformFromAstSync(sourceAst, src, babelConfig);
    const functionMap = generateFunctionMap(sourceAst, {filename});

    return {ast: nullthrows(ast), functionMap};
  } finally {
    if (OLD_BABEL_ENV) {
      process.env.BABEL_ENV = OLD_BABEL_ENV;
    }
  }
}

module.exports = ({
  transform,
}: BabelTransformer);
