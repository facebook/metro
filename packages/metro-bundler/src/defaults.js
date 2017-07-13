/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 */
'use strict';

exports.assetExts = [
  'bmp', 'gif', 'jpg', 'jpeg', 'png', 'psd', 'svg', 'webp', // Image formats
  'm4v', 'mov', 'mp4', 'mpeg', 'mpg', 'webm', // Video formats
  'aac', 'aiff', 'caf', 'm4a', 'mp3', 'wav', // Audio formats
  'html', 'pdf', // Document formats
  'otf', 'ttf', // Font formats
];

exports.sourceExts = ['js', 'json'];

exports.moduleSystem = require.resolve('./Resolver/polyfills/require.js');

exports.platforms = ['ios', 'android', 'windows', 'web'];

exports.providesModuleNodeModules = [
  'react-native',
  'react-native-windows',
];

exports.runBeforeMainModule = [
  // Ensures essential globals are available and are patched correctly.
  'InitializeCore',
];
