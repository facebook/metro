/**
 * Copyright (c) 2015-present, Facebook, Inc.
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

const babel = require('babel-core');

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
    const {ast} = babel.transform(src, {filename, code: false, plugins});

    return {ast};
  } finally {
    process.env.BABEL_ENV = OLD_BABEL_ENV;
  }
};
