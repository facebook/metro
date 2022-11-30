/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

// Note: This is a fork of the fb-specific transform.js

'use strict';

import type {BabelCoreOptions, Plugins} from '@babel/core';
import type {
  BabelTransformer,
  BabelTransformerArgs,
} from 'metro-babel-transformer';
import type {FBSourceFunctionMap} from 'metro-source-map/src/source-map';

const {parseSync, transformFromAstSync} = require('@babel/core');
const inlineRequiresPlugin = require('babel-preset-fbjs/plugins/inline-requires');
const crypto = require('crypto');
const fs = require('fs');
const makeHMRConfig = require('metro-react-native-babel-preset/src/configs/hmr');
const {generateFunctionMap} = require('metro-source-map');
const nullthrows = require('nullthrows');
const path = require('path');

const cacheKeyParts = [
  fs.readFileSync(__filename),
  require('babel-preset-fbjs/package.json').version,
];

// TS detection conditions copied from metro-react-native-babel-preset
function isTypeScriptSource(fileName: string) {
  return !!fileName && fileName.endsWith('.ts');
}

function isTSXSource(fileName: string) {
  return !!fileName && fileName.endsWith('.tsx');
}

/**
 * Return a memoized function that checks for the existence of a
 * project level .babelrc file, and if it doesn't exist, reads the
 * default RN babelrc file and uses that.
 */
const getBabelRC = (function () {
  let babelRC: ?BabelCoreOptions = null;

  /* $FlowFixMe[missing-local-annot] The type annotation(s) required by Flow's
   * LTI update could not be added via codemod */
  return function _getBabelRC({
    projectRoot,
    extendsBabelConfigPath,
    ...options
  }) {
    if (babelRC != null) {
      return babelRC;
    }

    babelRC = ({
      plugins: [],
      extends: extendsBabelConfigPath,
    }: BabelCoreOptions);

    if (extendsBabelConfigPath) {
      return babelRC;
    }

    // Let's look for a babel config file in the project root.
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
        // $FlowFixMe[incompatible-use] `extends` is missing in null or undefined.
        babelRC.extends = projectBabelRCPath;
      }
    }

    // If a babel config file doesn't exist in the project then
    // the default preset for react-native will be used instead.
    // $FlowFixMe[incompatible-use] `extends` is missing in null or undefined.
    // $FlowFixMe[incompatible-type] `extends` is missing in null or undefined.
    if (!babelRC.extends) {
      const {experimentalImportSupport, ...presetOptions} = options;

      // $FlowFixMe[incompatible-use] `presets` is missing in null or undefined.
      babelRC.presets = [
        [
          require('metro-react-native-babel-preset'),
          /* $FlowFixMe(>=0.122.0 site=react_native_fb) This comment suppresses
           * an error found when Flow v0.122.0 was deployed. To see the error,
           * delete this comment and run Flow. */
          {
            projectRoot,
            ...presetOptions,
            disableImportExportTransform: experimentalImportSupport,
            enableBabelRuntime: options.enableBabelRuntime,
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
function buildBabelConfig(
  filename: string,
  /* $FlowFixMe[missing-local-annot] The type annotation(s) required by Flow's
   * LTI update could not be added via codemod */
  options,
  plugins?: Plugins = [],
): BabelCoreOptions {
  const babelRC = getBabelRC(options);

  const extraConfig: BabelCoreOptions = {
    babelrc:
      typeof options.enableBabelRCLookup === 'boolean'
        ? options.enableBabelRCLookup
        : true,
    code: false,
    filename,
    highlightCode: true,
  };

  let config: BabelCoreOptions = {
    ...babelRC,
    ...extraConfig,
  };

  // Add extra plugins
  const extraPlugins = [];

  if (options.inlineRequires) {
    extraPlugins.push(inlineRequiresPlugin);
  }

  const withExtrPlugins = (config.plugins = extraPlugins.concat(
    config.plugins,
    plugins,
  ));

  if (options.dev && options.hot) {
    // Note: this intentionally doesn't include the path separator because
    // I'm not sure which one it should use on Windows, and false positives
    // are unlikely anyway. If you later decide to include the separator,
    // don't forget that the string usually *starts* with "node_modules" so
    // the first one often won't be there.
    const mayContainEditableReactComponents =
      filename.indexOf('node_modules') === -1;

    if (mayContainEditableReactComponents) {
      const hmrConfig = makeHMRConfig();
      hmrConfig.plugins = withExtrPlugins.concat(hmrConfig.plugins);
      config = {...config, ...hmrConfig};
    }
  }

  return {
    ...babelRC,
    ...config,
  };
}

function transform({filename, options, src, plugins}: BabelTransformerArgs): {
  ast: BabelNodeFile,
  functionMap: ?FBSourceFunctionMap,
  ...
} {
  const OLD_BABEL_ENV = process.env.BABEL_ENV;
  process.env.BABEL_ENV = options.dev
    ? 'development'
    : process.env.BABEL_ENV || 'production';

  try {
    const babelConfig = {
      // ES modules require sourceType='module' but OSS may not always want that
      sourceType: 'unambiguous',
      ...buildBabelConfig(filename, options, plugins),
      caller: {name: 'metro', bundler: 'metro', platform: options.platform},
      ast: true,
    };
    const sourceAst =
      isTypeScriptSource(filename) ||
      isTSXSource(filename) ||
      !options.hermesParser
        ? parseSync(src, babelConfig)
        : require('hermes-parser').parse(src, {
            babel: true,
            sourceType: babelConfig.sourceType,
          });
    const result = transformFromAstSync(sourceAst, src, babelConfig);
    const functionMap = generateFunctionMap(sourceAst, {filename});

    // The result from `transformFromAstSync` can be null (if the file is ignored)
    if (!result) {
      /* $FlowFixMe BabelTransformer specifies that the `ast` can never be null but
       * the function returns here. Discovered when typing `BabelNode`. */
      return {ast: null, functionMap};
    }

    return {ast: nullthrows(result.ast), functionMap};
  } finally {
    if (OLD_BABEL_ENV) {
      process.env.BABEL_ENV = OLD_BABEL_ENV;
    }
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
