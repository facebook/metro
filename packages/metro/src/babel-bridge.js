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

const IS_BABEL7 = process.env.BABEL_VERSION === '7';

// ## Babel 6 stuff

const babelCore6 = require('babel-core');
const babelGenerate6 = require('babel-generator').default;
const babelTemplate6 = require('babel-template');
const babelTraverse6 = require('babel-core').traverse;
const babelTypes6 = require('babel-core').types;
const babylon6 = require('babylon');

const externalHelpersPlugin6 = require('babel-plugin-external-helpers');
const inlineRequiresPlugin6 = require('babel-preset-fbjs/plugins/inline-requires');
const makeHMRConfig6 = require('babel-preset-react-native/configs/hmr');
const resolvePlugins6 = require('babel-preset-react-native/lib/resolvePlugins');
// register has side effects so don't include by default (only used in a test)
const getBabelRegisterConfig6 = () => require('./babelRegisterOnly').config;
// load given preset as a babel6 preset
const getPreset6 = (preset: string) =>
  // $FlowFixMe: dynamic require can't be avoided
  require('babel-preset-' + preset);

// ## Babel 7 stuff

const babelCore7 = require('@babel/core');
const babelGenerate7 = require('@babel/generator').default;
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
  return plugins.map(plugin => {
    // Normalise plugin to an array.
    plugin = Array.isArray(plugin) ? plugin : [plugin];
    // Only resolve the plugin if it's a string reference.
    if (typeof plugin[0] === 'string') {
      // $FlowFixMe these plugins need to be included here
      const required: ModuleES6 | {} = require('@babel/plugin-' + plugin[0]);
      // es6 import default?
      // $FlowFixMe should properly type this plugin structure
      plugin[0] = required.__esModule ? required.default : required;
    }
    return plugin;
  });
}

module.exports = {
  version: IS_BABEL7 ? 7 : 6,

  // need to abstract the transform* funcs here since their name changed
  transformSync: IS_BABEL7 ? babelCore7.transformSync : babelCore6.transform,
  transformFileSync: IS_BABEL7
    ? babelCore7.transformFileSync
    : babelCore6.transformFile,
  transformFromAstSync: IS_BABEL7
    ? babelCore7.transformFromAstSync
    : babelCore6.transformFromAst,

  babelGenerate: IS_BABEL7 ? babelGenerate7 : babelGenerate6,
  babelTemplate: IS_BABEL7 ? babelTemplate7 : babelTemplate6,
  babelTraverse: IS_BABEL7 ? babelTraverse7 : babelTraverse6,
  babelTypes: IS_BABEL7 ? babelTypes7 : babelTypes6,
  getBabelRegisterConfig: IS_BABEL7
    ? getBabelRegisterConfig7
    : getBabelRegisterConfig6,
  babylon: IS_BABEL7 ? babylon7 : babylon6,

  externalHelpersPlugin: IS_BABEL7
    ? externalHelpersPlugin7
    : externalHelpersPlugin6,
  inlineRequiresPlugin: IS_BABEL7
    ? inlineRequiresPlugin7
    : inlineRequiresPlugin6,
  makeHMRConfig: IS_BABEL7 ? makeHMRConfig7 : makeHMRConfig6,
  resolvePlugins: IS_BABEL7 ? resolvePlugins7 : resolvePlugins6,
  getPreset: IS_BABEL7 ? getPreset7 : getPreset6,
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
      plugins: resolvePlugins7([
        [
          'react-transform',
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
      ]),
    };
  };
}

function getPreset7() {
  // from: fbsource/xplat/js/node_modules/babel-preset-react-native/configs/main.js
  /**
   * Copyright (c) 2015-present, Facebook, Inc.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   */
  'use strict';

  function addPluginsWhenSourceNeedsIt(src, plugins) {
    // not sure what happened to this plugin. obsoleted?
    // if (src.indexOf('async') !== -1 || src.indexOf('await') !== -1) {
    //   plugins.push('syntax-async-functions');
    // }
    if (src.indexOf('class') !== -1) {
      plugins.push('transform-classes');
      if (src.indexOf('...') !== -1) {
        plugins.push('transform-spread');
        plugins.push('proposal-object-rest-spread');
      }
    }
    if (src.indexOf('=>') !== -1) {
      plugins.push('transform-arrow-functions');
    }
    if (src.indexOf('const') !== -1) {
      plugins.push('check-constants');
    }
    if (src.indexOf('`') !== -1) {
      plugins.push('transform-template-literals');
    }
    if (src.indexOf('Object.assign') !== -1) {
      plugins.push('transform-object-assign');
    }
    if (src.indexOf('for') !== -1 && src.indexOf('of') !== -1) {
      plugins.push(['transform-for-of', {loose: true}]);
      if (src.indexOf('Symbol') !== -1) {
        plugins.push(transformSymbolMember());
      }
    }
    if (
      src.indexOf('React.createClass') !== -1 ||
      src.indexOf('createReactClass') !== -1
    ) {
      plugins.push('transform-react-display-name');
    }
    if (src.indexOf('import(')) {
      plugins.push(transformDynamicImport());
    }
  }

  const getPreset = (src, options) => {
    const plugins = [];

    plugins.push(
      // 'syntax-class-properties',
      // 'syntax-trailing-function-commas',
      'proposal-class-properties',
      'transform-block-scoping',
      'transform-computed-properties',
      'transform-destructuring',
      'transform-function-name',
      'transform-literals',
      'transform-parameters',
      'transform-shorthand-properties',
      'transform-flow-strip-types',
      'transform-react-jsx',
      'transform-regenerator',
      ['transform-modules-commonjs', {strict: false, allowTopLevelThis: true}],
    );

    if (src !== null && src !== undefined) {
      addPluginsWhenSourceNeedsIt(src, plugins);
    }

    if (options && options.dev) {
      plugins.push('transform-react-jsx-source');
    }

    return {
      comments: false,
      compact: true,
      plugins: resolvePlugins7(plugins),
    };
  };

  let base;
  let devTools;

  // TODO: options probably has more properties...
  return (options: {withDevTools?: boolean}) => {
    if (options.withDevTools == null) {
      const env = process.env.BABEL_ENV || process.env.NODE_ENV;
      if (!env || env === 'development') {
        return devTools || (devTools = getPreset(null, {dev: true}));
      }
    }
    return base || (base = getPreset(null));
  };
}

function transformSymbolMember() {
  // from: fbsource/xplat/js/node_modules/babel-preset-react-native/transforms/transform-symbol-member.js

  /**
   * Copyright (c) 2015-present, Facebook, Inc.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   */

  'use strict';

  /*eslint consistent-return: 0*/

  /**
   * Transforms function properties of the `Symbol` into
   * the presence check, and fallback string "@@<name>".
   *
   * Example:
   *
   *   Symbol.iterator;
   *
   * Transformed to:
   *
   *   typeof Symbol.iterator === 'function' ? Symbol.iterator : '@@iterator';
   */
  return function symbolMember() {
    const t = babelTypes7;

    return {
      visitor: {
        MemberExpression(path) {
          if (!isAppropriateMember(path)) {
            return;
          }

          const node = path.node;

          path.replaceWith(
            t.conditionalExpression(
              t.binaryExpression(
                '===',
                t.unaryExpression('typeof', t.identifier('Symbol'), true),
                t.stringLiteral('function'),
              ),
              node,
              t.stringLiteral(`@@${node.property.name}`),
            ),
          );

          // We should stop to avoid infinite recursion, since Babel
          // traverses replaced path, and again would hit our transform.
          path.stop();
        },
      },
    };
  };

  function isAppropriateMember(path) {
    const node = path.node;

    return (
      path.parentPath.type !== 'AssignmentExpression' &&
      node.object.type === 'Identifier' &&
      node.object.name === 'Symbol' &&
      node.property.type === 'Identifier'
    );
  }
}

function transformDynamicImport() {
  // from: fbsource/xplat/js/node_modules/babel-preset-react-native/transforms/transform-dynamic-import.js

  /**
   * Copyright (c) 2015-present, Facebook, Inc.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   */

  'use strict';

  const buildImport = babelTemplate7(
    'Promise.resolve().then(() => require(ARGS))',
  );

  const TYPE_IMPORT = 'Import';

  const plugin = {
    inherits: require('@babel/plugin-syntax-dynamic-import').default,

    visitor: {
      CallExpression(path) {
        if (path.node.callee.type !== TYPE_IMPORT) {
          return;
        }
        const newImport = buildImport({ARGS: path.node.arguments});
        path.replaceWith(newImport);
      },
    },
  };

  return plugin;
}

function getBabelRegisterConfig7() {
  // from: fbsource/xplat/js/metro/packages/metro/src/babelRegisterOnly.js
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

  require('./setupNodePolyfills');

  var _only = [];

  const PLUGINS = [
    'transform-flow-strip-types',
    'proposal-object-rest-spread',
    'proposal-class-properties',
  ];

  function config(onlyList: Array<string>) {
    _only = _only.concat(onlyList);
    return {
      presets: [],
      plugins: PLUGINS.map(pluginName =>
        // $FlowFixMe must require with dynamic string
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
