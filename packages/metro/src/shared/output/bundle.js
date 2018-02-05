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

const Server = require('../../Server');

const meta = require('./meta');
const relativizeSourceMap = require('../../lib/relativizeSourceMap');
const writeFile = require('./writeFile');

import type {OutputOptions, RequestOptions} from '../types.flow';
import type {MetroSourceMap} from 'metro-source-map';

function buildBundle(
  packagerClient: Server,
  requestOptions: RequestOptions,
): Promise<{code: string, map: string}> {
  return packagerClient.build({
    ...Server.DEFAULT_BUNDLE_OPTIONS,
    ...requestOptions,
    bundleType: 'bundle',
    isolateModuleIDs: true,
  });
}

function createCodeWithMap(map: string, sourceMapSourcesRoot: string): string {
  const sourceMap = relativizeSourceMap(
    (JSON.parse(map): MetroSourceMap),
    sourceMapSourcesRoot,
  );
  return JSON.stringify(sourceMap);
}

function saveBundleAndMap(
  bundle: {code: string, map: string},
  options: OutputOptions,
  log: (...args: Array<string>) => void,
): Promise<mixed> {
  const {
    bundleOutput,
    bundleEncoding: encoding,
    sourcemapOutput,
    sourcemapSourcesRoot,
  } = options;

  let {map} = bundle;
  if (sourcemapSourcesRoot !== undefined) {
    log('start');
    map = createCodeWithMap(map, sourcemapSourcesRoot);
    log('finish');
  }

  log('Writing bundle output to:', bundleOutput);

  const {code} = bundle;
  const writeBundle = writeFile(bundleOutput, code, encoding);
  const writeMetadata = writeFile(
    bundleOutput + '.meta',
    meta(code, encoding),
    'binary',
  );
  Promise.all([writeBundle, writeMetadata]).then(() =>
    log('Done writing bundle output'),
  );

  if (sourcemapOutput) {
    log('Writing sourcemap output to:', sourcemapOutput);
    const writeMap = writeFile(sourcemapOutput, map, null);
    writeMap.then(() => log('Done writing sourcemap output'));
    return Promise.all([writeBundle, writeMetadata, writeMap]);
  } else {
    return writeBundle;
  }
}

exports.build = buildBundle;
exports.save = saveBundleAndMap;
exports.formatName = 'bundle';
