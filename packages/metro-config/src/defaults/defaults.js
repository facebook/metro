/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

'use strict';

import type {PerfLogger, RootPerfLogger} from '../configTypes.flow';

const defaultCreateModuleIdFactory = require('metro/src/lib/createModuleIdFactory');

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
  'xml',
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
  'yaml',
  'yml',
  // Font formats
  'otf',
  'ttf',
  // Archives (virtual files)
  'zip',
];

exports.assetResolutions = ['1', '1.5', '2', '3', '4'];

exports.sourceExts = ['js', 'jsx', 'json', 'ts', 'tsx'];

exports.additionalExts = ['cjs', 'mjs'];

exports.moduleSystem = (require.resolve(
  'metro-runtime/src/polyfills/require.js',
): string);

exports.platforms = ['ios', 'android', 'windows', 'web'];

exports.DEFAULT_METRO_MINIFIER_PATH = 'metro-minify-terser';

exports.defaultCreateModuleIdFactory = defaultCreateModuleIdFactory;

exports.noopPerfLoggerFactory = (): RootPerfLogger => {
  class Logger {
    start() {}
    end() {}
    annotate() {}
    point() {}
    subSpan(): PerfLogger {
      return this;
    }
  }
  return new Logger();
};
