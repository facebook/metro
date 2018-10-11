/**
 * Copyright (c) Facebook, Inc. and its affiliates.
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
const fs = require('fs');
const inlineRequiresPlugin = require('babel-preset-fbjs/plugins/inline-requires');
const makeHMRConfig = require('metro-react-native-babel-preset/src/configs/hmr');
const path = require('path');

const {transformSync} = require('@babel/core');

import type {
  BabelTransformer,
  BabelTransformerArgs,
} from './JSTransformer/worker';
import type {Plugins as BabelPlugins} from '@babel/core';

const cacheKeyParts = [
  fs.readFileSync(__filename),
  require('babel-preset-fbjs/package.json').version,
];

/**
 * Return a memoized function that checks for the existence of a
 * project level .babelrc file, and if it doesn't exist, reads the
 * default RN babelrc file and uses that.
 */
const getBabelRC = (function() {
  let babelRC: ?{
    // `any` to avoid flow type mismatch with Babel 7's internal type of
    // `Array<string>` even though it correctly accepts the usage below.
    // eslint-disable-next-line lint/no-unclear-flowtypes
    presets?: any,
    extends?: string,
    plugins: BabelPlugins,
  } = null;

  return function _getBabelRC(projectRoot, options) {
    if (babelRC != null) {
      return babelRC;
    }

    babelRC = {plugins: []};

    // Let's look for a babel config file in the project root.
    // TODO look into adding a command line option to specify this location
    let projectBabelRCPath;

    // .babelrc
    if (projectRoot) {
      projectBabelRCPath = path.resolve(projectRoot, '.babelrc');
    }

    if (projectBabelRCPath) {
      // .babelrc.js
      if (!fs.existsSync(projectBabelRCPath)) {
        projectBabelRCPath = path.resolve(projectRoot, '.babelrc.js');
      }

      // babel.config.js
      if (!fs.existsSync(projectBabelRCPath)) {
        projectBabelRCPath = path.resolve(projectRoot, 'babel.config.js');
      }

      // If we found a babel config file, extend our config off of it
      // otherwise the default config will be used
      if (fs.existsSync(projectBabelRCPath)) {
        babelRC.extends = projectBabelRCPath;
      }
    }

    // If a babel config file doesn't exist in the project then
    // the default preset for react-native will be used instead.
    if (!babelRC.extends) {
      const {experimentalImportSupport, ...presetOptions} = options;

      babelRC.presets = [
        [
          require('metro-react-native-babel-preset'),
          {
            ...presetOptions,
            disableImportExportTransform: experimentalImportSupport,
          },
        ],
      ];
    }

    return babelRC;
  };
})();

/**
 * Given a filename and options, build a Babel
 * config object with the appropriate plugins.
 */
function buildBabelConfig(filename, options, plugins?: BabelPlugins = []) {
  const babelRC = getBabelRC(options.projectRoot, options);

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
  const extraPlugins = [];

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

function transform({filename, options, src, plugins}: BabelTransformerArgs) {
  const OLD_BABEL_ENV = process.env.BABEL_ENV;
  process.env.BABEL_ENV = options.dev ? 'development' : 'production';

  try {
    const babelConfig = buildBabelConfig(filename, options, plugins);
    const result = transformSync(src, {
      // ES modules require sourceType='module' but OSS may not always want that
      sourceType: 'unambiguous',
      ...babelConfig,
      ast: true,
    });

    // The result from `transformSync` can be null (if the file is ignored)
    if (!result) {
      return {ast: null};
    }

    return {ast: result.ast};
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
}: BabelTransformer);
