/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

import type {BundleOptions} from '../shared/types.flow';
import type {TransformProfile} from 'metro-babel-transformer';

const parsePlatformFilePath = require('../node-haste/lib/parsePlatformFilePath');
const parseCustomResolverOptions = require('./parseCustomResolverOptions');
const parseCustomTransformOptions = require('./parseCustomTransformOptions');
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

const getNumber = (
  query: $ReadOnly<{[opt: string]: string}>,
  opt: string,
  defaultValue: null,
) => {
  const number = parseInt(query[opt], 10);
  return Number.isNaN(number) ? defaultValue : number;
};

const getBundleType = (bundleType: string): 'map' | 'bundle' =>
  bundleType === 'map' ? bundleType : 'bundle';

const getTransformProfile = (transformProfile: string): TransformProfile =>
  transformProfile === 'hermes-stable' || transformProfile === 'hermes-canary'
    ? transformProfile
    : 'default';

module.exports = function parseOptionsFromUrl(
  requestUrl: string,
  platforms: Set<string>,
  bytecodeVersion: number,
): BundleOptions {
  const parsedURL = nullthrows(url.parse(requestUrl, true)); // `true` to parse the query param as an object.
  const query = nullthrows(parsedURL.query);
  const pathname =
    query.bundleEntry ||
    (parsedURL.pathname != null ? decodeURIComponent(parsedURL.pathname) : '');
  const platform =
    query.platform || parsePlatformFilePath(pathname, platforms).platform;
  const bundleType = getBundleType(path.extname(pathname).substr(1));
  const runtimeBytecodeVersion = getNumber(
    query,
    'runtimeBytecodeVersion',
    null,
  );

  return {
    bundleType,
    runtimeBytecodeVersion:
      bytecodeVersion === runtimeBytecodeVersion ? bytecodeVersion : null,
    customResolverOptions: parseCustomResolverOptions(parsedURL),
    customTransformOptions: parseCustomTransformOptions(parsedURL),
    dev: getBoolean(query, 'dev', true),
    entryFile: pathname.replace(/^(?:\.?\/)?/, './').replace(/\.[^/.]+$/, ''),
    excludeSource: getBoolean(query, 'excludeSource', false),
    hot: true,
    inlineSourceMap: getBoolean(query, 'inlineSourceMap', false),
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
      protocol:
        platform != null && platform.match(/^(android|ios)$/) ? 'http' : '',
      pathname: pathname.replace(/\.(bundle|delta)$/, '.map'),
    }),
    sourceUrl: requestUrl,
    unstable_transformProfile: getTransformProfile(
      query.unstable_transformProfile,
    ),
  };
};
