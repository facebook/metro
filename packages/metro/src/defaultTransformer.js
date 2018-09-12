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

import type {TransformOptions} from './JSTransformer/worker';
import type {Plugins as BabelPlugins} from 'babel-core';

type Params = {
  filename: string,
  options: TransformOptions,
  plugins?: BabelPlugins,
  src: string,
};

module.exports.transform = ({filename, options, plugins, src}: Params) => {
  const OLD_BABEL_ENV = process.env.BABEL_ENV;
  process.env.BABEL_ENV = options.dev ? 'development' : 'production';

  try {
    const {ast} = transformSync(src, {
      ast: true,
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
};
