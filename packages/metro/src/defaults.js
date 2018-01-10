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

exports.assetExts = [
  // Image formats
  'bmp',
  'gif',
  'jpg',
  'jpeg',
  'png',
  'psd',
  'svg',
  'webp',
  // Video formats
  'm4v',
  'mov',
  'mp4',
  'mpeg',
  'mpg',
  'webm',
  // Audio formats
  'aac',
  'aiff',
  'caf',
  'm4a',
  'mp3',
  'wav',
  // Document formats
  'html',
  'pdf',
  // Font formats
  'otf',
  'ttf',
];

exports.sourceExts = ['js', 'json'];

exports.moduleSystem = require.resolve('./lib/polyfills/require.js');

exports.platforms = ['ios', 'android', 'windows', 'web'];

exports.providesModuleNodeModules = ['react-native', 'react-native-windows'];

exports.transformModulePath = require.resolve('./defaultTransform.js');
