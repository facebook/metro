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

import type {BundleOptions} from '../shared/types.flow';
import type {TransformProfile} from 'metro-babel-transformer';

import {SourcePathsMode} from '../shared/types.flow';

const parsePlatformFilePath = require('../node-haste/lib/parsePlatformFilePath');
const parseCustomResolverOptions = require('./parseCustomResolverOptions');
const parseCustomTransformOptions = require('./parseCustomTransformOptions');
const jscSafeUrl = require('jsc-safe-url');
const nullthrows = require('nullthrows');
const path = require('path');
const url = require('url');

const getBoolean = (
  query: $ReadOnly<{[opt: string]: string}>,
  opt: string,
  defaultValue: boolean,
) =>
  query[opt] == null
    ? defaultValue
    : query[opt] === 'true' || query[opt] === '1';

const getBundleType = (bundleType: string): 'map' | 'bundle' =>
  bundleType === 'map' ? bundleType : 'bundle';

const getTransformProfile = (transformProfile: string): TransformProfile =>
  transformProfile === 'hermes-stable' || transformProfile === 'hermes-canary'
    ? transformProfile
    : 'default';

module.exports = function parseOptionsFromUrl(
  normalizedRequestUrl: string,
  platforms: Set<string>,
): BundleOptions {
  const parsedURL = nullthrows(url.parse(normalizedRequestUrl, true)); // `true` to parse the query param as an object.
  const query = nullthrows(parsedURL.query);
  const pathname =
    query.bundleEntry ||
    (parsedURL.pathname != null ? decodeURIComponent(parsedURL.pathname) : '');
  const platform =
    query.platform || parsePlatformFilePath(pathname, platforms).platform;
  const bundleType = getBundleType(path.extname(pathname).substr(1));

  return {
    bundleType,
    customResolverOptions: parseCustomResolverOptions(parsedURL),
    customTransformOptions: parseCustomTransformOptions(parsedURL),
    dev: getBoolean(query, 'dev', true),
    entryFile: pathname.replace(/^(?:\.?\/)?/, './').replace(/\.[^/.]+$/, ''),
    excludeSource: getBoolean(query, 'excludeSource', false),
    hot: true,
    inlineSourceMap: getBoolean(query, 'inlineSourceMap', false),
    lazy: getBoolean(query, 'lazy', false),
    minify: getBoolean(query, 'minify', false),
    modulesOnly: getBoolean(query, 'modulesOnly', false),
    onProgress: null,
    platform,
    runModule: getBoolean(query, 'runModule', true),
    shallow: getBoolean(query, 'shallow', false),
    sourceMapUrl: url.format({
      ...parsedURL,
      // The Chrome Debugger loads bundles via Blob urls, whose
      // protocol is blob:http. This breaks loading source maps through
      // protocol-relative URLs, which is why we must force the HTTP protocol
      // when loading the bundle for either Android or iOS.
      // TODO(T167298674): Remove when remote debugging is not needed in React Native
      protocol:
        platform != null && platform.match(/^(android|ios|vr|windows|macos)$/)
          ? 'http'
          : '',
      pathname: pathname.replace(/\.(bundle|delta)$/, '.map'),
    }),
    sourcePaths:
      SourcePathsMode.cast(query.sourcePaths) ?? SourcePathsMode.Absolute,
    sourceUrl: jscSafeUrl.toJscSafeUrl(normalizedRequestUrl),
    unstable_transformProfile: getTransformProfile(
      query.unstable_transformProfile,
    ),
  };
};
