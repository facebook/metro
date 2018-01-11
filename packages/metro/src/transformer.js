/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * Note: This is a fork of the fb-specific transform.js
 *
 * @flow
 * @format
 */
'use strict';

const babel = require('babel-core');
const crypto = require('crypto');
const externalHelpersPlugin = require('babel-plugin-external-helpers');
const fs = require('fs');
const inlineRequiresPlugin = require('babel-preset-fbjs/plugins/inline-requires');
const json5 = require('json5');
const makeHMRConfig = require('babel-preset-react-native/configs/hmr');
const path = require('path');
const resolvePlugins = require('babel-preset-react-native/lib/resolvePlugins');

import type {Plugins as BabelPlugins} from 'babel-core';
import type {Transformer, TransformOptions} from './JSTransformer/worker';

const cacheKeyParts = [
  fs.readFileSync(__filename),
  require('babel-plugin-external-helpers/package.json').version,
  require('babel-preset-fbjs/package.json').version,
  require('babel-preset-react-native/package.json').version,
];

/**
 * Return a memoized function that checks for the existence of a
 * project level .babelrc file, and if it doesn't exist, reads the
 * default RN babelrc file and uses that.
 */
const getBabelRC = (function() {
  let babelRC: ?{extends?: string, plugins: BabelPlugins} = null;

  return function _getBabelRC(projectRoot) {
    if (babelRC !== null) {
      return babelRC;
    }

    babelRC = {plugins: []};

    // Let's look for the .babelrc in the project root.
    // In the future let's look into adding a command line option to specify
    // this location.
    let projectBabelRCPath;
    if (projectRoot) {
      projectBabelRCPath = path.resolve(projectRoot, '.babelrc');
    }

    // If a .babelrc file doesn't exist in the project,
    // use the Babel config provided with react-native.
    if (!projectBabelRCPath || !fs.existsSync(projectBabelRCPath)) {
      babelRC = json5.parse(
        fs.readFileSync(path.resolve(__dirname, '..', 'rn-babelrc.json')),
      );

      // Require the babel-preset's listed in the default babel config
      babelRC.presets = babelRC.presets.map(preset =>
        // $FlowFixMe: dynamic require can't be avoided
        require('babel-preset-' + preset),
      );
      babelRC.plugins = resolvePlugins(babelRC.plugins);
    } else {
      // if we find a .babelrc file we tell babel to use it
      babelRC.extends = projectBabelRCPath;
    }

    return babelRC;
  };
})();

/**
 * Given a filename and options, build a Babel
 * config object with the appropriate plugins.
 */
function buildBabelConfig(filename, options, plugins?: BabelPlugins = []) {
  const babelRC = getBabelRC(options.projectRoot);

  const extraConfig = {
    babelrc:
      typeof options.enableBabelRCLookup === 'boolean'
        ? options.enableBabelRCLookup
        : true,
    code: false,
    filename,
  };

  let config = Object.assign({}, babelRC, extraConfig);

  // Add extra plugins
  const extraPlugins = [externalHelpersPlugin];

  if (options.inlineRequires) {
    extraPlugins.push(inlineRequiresPlugin);
  }

  config.plugins = extraPlugins.concat(config.plugins, plugins);

  if (options.dev && options.hot) {
    const hmrConfig = makeHMRConfig(options, filename);
    config = Object.assign({}, config, hmrConfig);
  }

  return Object.assign({}, babelRC, config);
}

type Params = {
  filename: string,
  options: {+retainLines?: boolean} & TransformOptions,
  plugins?: BabelPlugins,
  src: string,
};

function transform({filename, options, src, plugins}: Params) {
  options = options || {
    assetDataPlugins: [],
    platform: '',
    projectRoot: '',
    inlineRequires: false,
    minify: false,
  };

  const OLD_BABEL_ENV = process.env.BABEL_ENV;
  process.env.BABEL_ENV = options.dev ? 'development' : 'production';

  try {
    const babelConfig = buildBabelConfig(filename, options, plugins);
    const {ast} = babel.transform(src, babelConfig);

    return {ast};
  } finally {
    process.env.BABEL_ENV = OLD_BABEL_ENV;
  }
}

function getCacheKey() {
  var key = crypto.createHash('md5');
  cacheKeyParts.forEach(part => key.update(part));
  return key.digest('hex');
}

module.exports = ({
  transform,
  getCacheKey,
}: Transformer<{+retainLines?: boolean}>);
