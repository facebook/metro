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

const {transformSync} = require('@babel/core');

import type {Ast, Plugins} from '@babel/core';

export type CustomTransformOptions = {[string]: mixed, __proto__: null};

type BabelTransformerOptions = $ReadOnly<{
  customTransformOptions?: CustomTransformOptions,
  dev: boolean,
  disableFlowStripTypesTransform?: boolean,
  enableBabelRCLookup?: boolean,
  enableBabelRuntime: boolean,
  experimentalImportSupport?: boolean,
  hot: boolean,
  inlineRequires: boolean,
  minify: boolean,
  unstable_disableES6Transforms?: boolean,
  platform: ?string,
  projectRoot: string,
  publicPath: string,
}>;

export type BabelTransformerArgs = $ReadOnly<{|
  filename: string,
  options: BabelTransformerOptions,
  plugins?: Plugins,
  src: string,
|}>;

export type BabelTransformer = {|
  transform: BabelTransformerArgs => {ast: Ast},
  getCacheKey?: () => string,
|};

function transform({filename, options, plugins, src}: BabelTransformerArgs) {
  const OLD_BABEL_ENV = process.env.BABEL_ENV;
  process.env.BABEL_ENV = options.dev
    ? 'development'
    : process.env.BABEL_ENV || 'production';

  try {
    const {ast} = transformSync(src, {
      caller: {name: 'metro', platform: options.platform},
      ast: true,
      babelrc: options.enableBabelRCLookup,
      code: false,
      highlightCode: true,
      filename,
      plugins,
      sourceType: 'module',
    });

    return {ast};
  } finally {
    process.env.BABEL_ENV = OLD_BABEL_ENV;
  }
}

module.exports = ({
  transform,
}: BabelTransformer);
