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

function createCodeWithMap(
  bundle: {code: string, map: string},
  dev: boolean,
  sourceMapSourcesRoot?: string,
): {code: string, map: MetroSourceMap} {
  const map = bundle.map;
  const sourceMap = relativizeSourceMap(
    (JSON.parse(map): MetroSourceMap),
    sourceMapSourcesRoot,
  );
  return {
    code: bundle.code,
    map: sourceMap,
  };
}

function saveBundleAndMap(
  bundle: {code: string, map: string},
  options: OutputOptions,
  log: (...args: Array<string>) => void,
): Promise<mixed> {
  const {
    bundleOutput,
    bundleEncoding: encoding,
    dev,
    sourcemapOutput,
    sourcemapSourcesRoot,
  } = options;

  log('start');
  const codeWithMap = createCodeWithMap(bundle, !!dev, sourcemapSourcesRoot);
  log('finish');

  log('Writing bundle output to:', bundleOutput);

  const {code} = codeWithMap;
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
    const map =
      typeof codeWithMap.map !== 'string'
        ? JSON.stringify(codeWithMap.map)
        : codeWithMap.map;
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
