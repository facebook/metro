/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @flow (won't like this)
 * @format
 */

'use strict';

// This is a temporary migration bridge to switch between babel 6 and 7

const babelTemplate7 = require('@babel/template').default;
const babelTraverse7 = require('@babel/traverse').default;
const babelTypes7 = require('@babel/types');
const babylon7 = require('metro-babylon7');
const externalHelpersPlugin7 = require('babel-plugin-external-helpers');
const inlineRequiresPlugin7 = require('babel-preset-fbjs/plugins/inline-requires');

const makeHMRConfig7 = makeMakeHMRConfig7();
function resolvePlugins7(plugins: Array<any>) {
  /**
   * from: babel-preset-react-native/lib/resolvePlugins
   * "Ported" to Babel 7
   *
   * Manually resolve all default Babel plugins.
   * `babel.transform` will attempt to resolve all base plugins relative to
   * the file it's compiling. This makes sure that we're using the plugins
   * installed in the react-native package.
   */
  type ModuleES6 = {__esModule?: boolean, default?: {}};
  /* $FlowFixMe(>=0.70.0 site=react_native_fb) This comment suppresses an
   * error found when Flow v0.70 was deployed. To see the error delete this
   * comment and run Flow. */
  return plugins.map(plugin => {
    // Normalise plugin to an array.
    plugin = Array.isArray(plugin) ? plugin : [plugin];
    // Only resolve the plugin if it's a string reference.
    if (typeof plugin[0] === 'string') {
      // $FlowFixMe TODO t26372934 plugin require
      const required: ModuleES6 | {} = require('@babel/plugin-' + plugin[0]);
      // es6 import default?
      // $FlowFixMe should properly type this plugin structure
      plugin[0] = required.__esModule ? required.default : required;
    }
    return plugin;
  });
}

module.exports = {
  babelTemplate: babelTemplate7,
  babelTraverse: babelTraverse7,
  babelTypes: babelTypes7,
  getBabelRegisterConfig: getBabelRegisterConfig7,
  babylon: babylon7,

  externalHelpersPlugin: externalHelpersPlugin7,
  inlineRequiresPlugin: inlineRequiresPlugin7,
  makeHMRConfig: makeHMRConfig7,
  resolvePlugins: resolvePlugins7,
  getPreset,
};

function makeMakeHMRConfig7() {
  // from: babel-preset-react-native/configs/hmr
  /**
   * Copyright (c) 2015-present, Facebook, Inc.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   */
  'use strict';

  var path = require('path');
  var hmrTransform = 'react-transform-hmr/lib/index.js';
  var transformPath = require.resolve(hmrTransform);

  return function(options: mixed, filename?: string) {
    var transform = filename
      ? './' + path.relative(path.dirname(filename), transformPath) // packager can't handle absolute paths
      : hmrTransform;

    // Fix the module path to use '/' on Windows.
    if (path.sep === '\\') {
      transform = transform.replace(/\\/g, '/');
    }

    return {
      plugins: [
        [
          require('metro-babel7-plugin-react-transform'),
          {
            transforms: [
              {
                transform,
                imports: ['react'],
                locals: ['module'],
              },
            ],
          },
        ],
      ],
    };
  };
}

function getPreset(name: string) {
  if (!/^(?:@babel\/|babel-)preset-/.test(name)) {
    try {
      name = require.resolve(`babel-preset-${name}`);
    } catch (error) {
      if (error && error.conde === 'MODULE_NOT_FOUND') {
        name = require.resolve(`@babel/preset-${name}`);
      }
    }
  }
  //$FlowFixMe: TODO t26372934 this has to be dynamic
  return require(name);
}

function getBabelRegisterConfig7() {
  // from: metro/packages/metro-babel-register/babel-register.js
  // (dont use babel-register anymore, it obsoleted with babel 7)

  /**
   * Copyright (c) 2015-present, Facebook, Inc.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * @format
   */
  'use strict';

  require('metro-babel-register/src/node-polyfills');

  var _only = [];

  const PLUGINS = [
    'transform-flow-strip-types',
    'proposal-object-rest-spread',
    'proposal-class-properties',
  ];

  function config(onlyList: Array<string>) {
    /* $FlowFixMe(>=0.70.0 site=react_native_fb) This comment suppresses an
     * error found when Flow v0.70 was deployed. To see the error delete this
     * comment and run Flow. */
    _only = _only.concat(onlyList);
    return {
      presets: [],
      /* $FlowFixMe(>=0.70.0 site=react_native_fb) This comment suppresses an
       * error found when Flow v0.70 was deployed. To see the error delete
       * this comment and run Flow. */
      plugins: PLUGINS.map(pluginName =>
        // $FlowFixMe TODO t26372934 plugin require
        require(`@babel/plugin-${pluginName}`),
      ),
      only: _only,
      retainLines: true,
      sourceMaps: 'inline',
      babelrc: false,
    };
  }

  return config;
}
