/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

const nullthrows = require('nullthrows');
const parseCustomTransformOptions = require('./parseCustomTransformOptions');
const parsePlatformFilePath = require('../node-haste/lib/parsePlatformFilePath');
const path = require('path');
const url = require('url');

const {revisionIdFromString} = require('../IncrementalBundler');

import type {RevisionId} from '../IncrementalBundler';
import type {BundleOptions} from '../shared/types.flow';

function getBoolOptionFromQuery(
  query: {[string]: string},
  opt: string,
  defaultVal: boolean,
): boolean {
  if (query[opt] == null) {
    return defaultVal;
  }

  return query[opt] === 'true' || query[opt] === '1';
}

function parseOptionsFromUrl(
  reqUrl: string,
  projectRoot: string,
  platforms: Set<string>,
): {|
  revisionId: ?RevisionId,
  options: BundleOptions,
|} {
  // `true` to parse the query param as an object.
  const urlObj = nullthrows(url.parse(reqUrl, true));
  const urlQuery = nullthrows(urlObj.query);

  const pathname =
    urlObj.pathname != null ? decodeURIComponent(urlObj.pathname) : '';

  let isMap = false;
  let isDelta = false;

  // Backwards compatibility. Options used to be as added as '.' to the
  // entry module name. We can safely remove these options.
  const entryFile =
    pathname
      .replace(/^\//, '')
      .split('.')
      .filter(part => {
        if (part === 'map') {
          isMap = true;
          return false;
        }
        if (part === 'delta') {
          isDelta = true;
          return false;
        }
        if (
          part === 'includeRequire' ||
          part === 'runModule' ||
          part === 'bundle' ||
          part === 'assets'
        ) {
          return false;
        }
        return true;
      })
      .join('.') + '.js';

  // try to get the platform from the url
  const platform =
    urlQuery.platform || parsePlatformFilePath(pathname, platforms).platform;

  const revisionId = urlQuery.revisionId || urlQuery.deltaBundleId || null;

  const dev = getBoolOptionFromQuery(urlQuery, 'dev', true);
  const minify = getBoolOptionFromQuery(urlQuery, 'minify', false);
  const excludeSource = getBoolOptionFromQuery(
    urlQuery,
    'excludeSource',
    false,
  );
  const inlineSourceMap = getBoolOptionFromQuery(
    urlQuery,
    'inlineSourceMap',
    false,
  );
  const runModule = getBoolOptionFromQuery(urlQuery, 'runModule', true);
  const embedDelta = getBoolOptionFromQuery(urlQuery, 'embedDelta', false);

  const customTransformOptions = parseCustomTransformOptions(urlObj);

  return {
    revisionId: revisionId != null ? revisionIdFromString(revisionId) : null,
    options: {
      embedDelta,
      customTransformOptions,
      dev,
      hot: true,
      minify,
      platform,
      onProgress: null,
      entryFile: path.resolve(projectRoot, entryFile),
      bundleType: isMap ? 'map' : isDelta ? 'delta' : 'bundle',
      sourceMapUrl: url.format({
        ...urlObj,
        pathname: pathname.replace(/\.(bundle|delta)$/, '.map'),
      }),
      runModule,
      excludeSource,
      inlineSourceMap,
    },
  };
}

module.exports = parseOptionsFromUrl;
