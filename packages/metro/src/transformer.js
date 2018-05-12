/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Note: This is a fork of the fb-specific transform.js
 *
 * @flow
 * @format
 */
'use strict';

const crypto = require('crypto');
const externalHelpersPlugin = require('babel-plugin-external-helpers');
const fs = require('fs');
const inlineRequiresPlugin = require('babel-preset-fbjs/plugins/inline-requires');
const json5 = require('json5');
const makeHMRConfig = require('./hmrConfig');
const path = require('path');

const {transformSync} = require('@babel/core');

import type {Transformer, TransformOptions} from './JSTransformer/worker';
import type {Plugins as BabelPlugins} from 'babel-core';

type ModuleES6 = {__esModule?: boolean, default?: {}};

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
        fs.readFileSync(require.resolve('metro/rn-babelrc.json')),
      );

      // Require the babel-preset's listed in the default babel config
      babelRC.presets = babelRC.presets.map((name: string) => {
        if (!/^(?:@babel\/|babel-)preset-/.test(name)) {
          try {
            name = require.resolve(`babel-preset-${name}`);
          } catch (error) {
            if (error && error.conde === 'MODULE_NOT_FOUND') {
              name = require.resolve(`@babel/preset-${name}`);
            } else {
              throw new Error(error);
            }
          }
        }
        return require(name);
      });
      babelRC.plugins = babelRC.plugins.map(plugin => {
        // Manually resolve all default Babel plugins.
        // `babel.transform` will attempt to resolve all base plugins relative to
        // the file it's compiling. This makes sure that we're using the plugins
        // installed in the react-native package.

        // Normalise plugin to an array.
        plugin = Array.isArray(plugin) ? plugin : [plugin];
        // Only resolve the plugin if it's a string reference.
        if (typeof plugin[0] === 'string') {
          // $FlowFixMe TODO t26372934 plugin require
          const required: ModuleES6 | {} = require('@babel/plugin-' +
            plugin[0]);
          // es6 import default?
          // $FlowFixMe should properly type this plugin structure
          plugin[0] = required.__esModule ? required.default : required;
        }
      });
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
    highlightCode: true,
  };

  let config = Object.assign({}, babelRC, extraConfig);

  // Add extra plugins
  const extraPlugins = [externalHelpersPlugin];

  if (options.inlineRequires) {
    extraPlugins.push(inlineRequiresPlugin);
  }

  config.plugins = extraPlugins.concat(config.plugins, plugins);

  /* $FlowFixMe(>=0.68.0 site=react_native_fb) This comment suppresses an error
   * found when Flow v0.68 was deployed. To see the error delete this comment
   * and run Flow. */
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
  const OLD_BABEL_ENV = process.env.BABEL_ENV;
  /* $FlowFixMe(>=0.68.0 site=react_native_fb) This comment suppresses an error
   * found when Flow v0.68 was deployed. To see the error delete this comment
   * and run Flow. */
  process.env.BABEL_ENV = options.dev ? 'development' : 'production';

  try {
    const babelConfig = buildBabelConfig(filename, options, plugins);
    const {ast} = transformSync(src, babelConfig);

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
