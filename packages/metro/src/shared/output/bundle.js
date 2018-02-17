/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const Server = require('../../Server');

const meta = require('./meta');
const relativizeSourceMapInline = require('../../lib/relativizeSourceMap');
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

function relativateSerializedMap(
  map: string,
  sourceMapSourcesRoot: string,
): string {
  const sourceMap = (JSON.parse(map): MetroSourceMap);
  relativizeSourceMapInline(sourceMap, sourceMapSourcesRoot);
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
    let {map} = bundle;
    if (sourcemapSourcesRoot !== undefined) {
      log('start relativating source map');
      map = relativateSerializedMap(map, sourcemapSourcesRoot);
      log('finished relativating');
    }

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
