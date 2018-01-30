/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails oncall+javascript_foundation
 * @flow (won't like this)
 * @format
 */

'use strict';

// This is a temporary migration bridge to switch between babel 6 and 7

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

module.exports = {
  // TODO: `babelGenerate: process.env.BABEL_VER === 7 ? babelGenerate7 : babelGenerate6,` etc
  version: process.env.BABEL_VER === '7' ? 7 : 6,

  babelCore: babelCore6,
  babelGenerate: babelGenerate6,
  babelTemplate: babelTemplate6,
  babelTraverse: babelTraverse6,
  babelTypes: babelTypes6,
  babylon: babylon6,

  externalHelpersPlugin: externalHelpersPlugin6,
  inlineRequiresPlugin: inlineRequiresPlugin6,
  makeHMRConfig: makeHMRConfig6,
  resolvePlugins: resolvePlugins6,
};
