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

import type {BundleOptions} from '../shared/types';
import type {TransformProfile} from 'metro-babel-transformer';

import {SourcePathsMode} from '../shared/types';

const parsePlatformFilePath = require('../node-haste/lib/parsePlatformFilePath');
const parseCustomResolverOptions = require('./parseCustomResolverOptions');
const parseCustomTransformOptions = require('./parseCustomTransformOptions');
const debug = require('debug')('Metro:Server');
const jscSafeUrl = require('jsc-safe-url');
const path = require('path');

const TRUE_STRINGS = new Set<string>(['true', '1']);

// This is a bit weird but this is the recommended way of getting around "URL" demanding to have a valid protocol
// for when handling relative URLs: https://nodejs.org/docs/latest-v24.x/api/url.html#urlresolvefrom-to
const RESOLVE_BASE_URL = 'resolve://';

const getBoolQueryParam = (
  searchParams: URLSearchParams,
  opt: string,
  defaultValue: boolean,
) =>
  searchParams.has(opt)
    ? TRUE_STRINGS.has(searchParams.get(opt) || '')
    : defaultValue;

const getBundleType = (bundleType: string): 'map' | 'bundle' =>
  bundleType === 'map' ? bundleType : 'bundle';

const getTransformProfile = (transformProfile: ?string): TransformProfile =>
  transformProfile === 'hermes-stable' || transformProfile === 'hermes-canary'
    ? transformProfile
    : 'default';

module.exports = function parseBundleOptionsFromBundleRequestUrl(
  rawNonJscSafeUrlEncodedUrl: string,
  platforms: Set<string>,
): {
  ...BundleOptions,
  // Retained for backwards compatibility, unused in Metro, to be removed.
  bundleType: string,
} {
  const {
    protocol: _tempProtocol,
    host,
    searchParams,
    pathname: requestPathname,
    search,
    hash,
  } = new URL(rawNonJscSafeUrlEncodedUrl, RESOLVE_BASE_URL /* baseURL */);

  const isRelativeProtocol = rawNonJscSafeUrlEncodedUrl.startsWith('//');
  const isNoProtocol =
    !isRelativeProtocol && _tempProtocol + '//' === RESOLVE_BASE_URL;

  // TODO: next diff (D79809398) will remove the support for "isNoProtocol" to make the requested URL more expected (either "//" or "http://")
  const protocol = isNoProtocol // e.g. "./foo/bar.js" or "foo/bar.js" both converted to paths relative to root
    ? ''
    : isRelativeProtocol // e.g. "//localhost:8081/foo/bar.js?platform=ios"
      ? '//'
      : _tempProtocol + '//'; // e.g. "http://localhost:8081/foo/bar.js?platform=ios"

  const sourceUrl = jscSafeUrl.toJscSafeUrl(
    protocol + host + requestPathname + search + hash,
  );

  const pathname = searchParams.get('bundleEntry') || requestPathname || '';

  const platform =
    searchParams.get('platform') ||
    parsePlatformFilePath(pathname, platforms).platform;

  const bundleType = getBundleType(path.extname(pathname).substr(1));

  // The Chrome Debugger loads bundles via Blob urls, whose
  // protocol is blob:http. This breaks loading source maps through
  // protocol-relative URLs, which is why we must force the HTTP protocol
  // when loading the bundle for either Android or iOS.
  // TODO(T167298674): Remove when remote debugging is not needed in React Native
  const sourceMapUrlProtocol =
    platform != null && platform.match(/^(android|ios|vr|windows|macos)$/)
      ? 'http://'
      : '//';
  const {pathname: sourceMapPathname} = new URL(
    pathname.replace(/\.(bundle|delta)$/, '.map'),
    RESOLVE_BASE_URL /* baseURL */,
  );
  const sourceMapUrl =
    sourceMapUrlProtocol + host + sourceMapPathname + search + hash;

  // decoding URL into a file path
  const entryFile = decodeURI(pathname)
    .replace(/^(?:\.?\/)?/, './')
    .replace(/\.[^/.]+$/, '');

  debug(
    'Bundle options parsed from rawNonJscSafeUrlEncodedUrl:    %s:\nsourceUrl:    %s\nsourceMapUrl:    %s\nentryFile:    %s',
    rawNonJscSafeUrlEncodedUrl,
    sourceUrl,
    sourceMapUrl,
    entryFile,
  );

  return {
    bundleType,
    customResolverOptions: parseCustomResolverOptions(searchParams),
    customTransformOptions: parseCustomTransformOptions(searchParams),
    dev: getBoolQueryParam(searchParams, 'dev', true),
    // absolute and relative paths are converted to paths relative to root
    entryFile,
    excludeSource: getBoolQueryParam(searchParams, 'excludeSource', false),
    hot: true,
    inlineSourceMap: getBoolQueryParam(searchParams, 'inlineSourceMap', false),
    lazy: getBoolQueryParam(searchParams, 'lazy', false),
    minify: getBoolQueryParam(searchParams, 'minify', false),
    modulesOnly: getBoolQueryParam(searchParams, 'modulesOnly', false),
    onProgress: null,
    platform,
    runModule: getBoolQueryParam(searchParams, 'runModule', true),
    shallow: getBoolQueryParam(searchParams, 'shallow', false),
    sourceMapUrl,
    sourcePaths:
      SourcePathsMode.cast(searchParams.get('sourcePaths')) ??
      SourcePathsMode.Absolute,
    sourceUrl,
    unstable_transformProfile: getTransformProfile(
      searchParams.get('unstable_transformProfile'),
    ),
  };
};
