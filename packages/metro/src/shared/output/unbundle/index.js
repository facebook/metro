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

const Server = require('../../../Server');

const asAssets = require('./as-assets');
const asIndexedFile = require('./as-indexed-file').save;

import type {OutputOptions, RequestOptions} from '../../types.flow';
import type {RamBundleInfo} from '../../../DeltaBundler/Serializers';

async function buildBundle(
  packagerClient: Server,
  requestOptions: RequestOptions,
): Promise<RamBundleInfo> {
  const options = {
    ...Server.DEFAULT_BUNDLE_OPTIONS,
    ...requestOptions,
    bundleType: 'ram',
    isolateModuleIDs: true,
  };
  return await packagerClient.getRamBundleInfo(options);
}

function saveUnbundle(
  bundle: RamBundleInfo,
  options: OutputOptions,
  log: (x: string) => void,
): Promise<mixed> {
  // we fork here depending on the platform:
  // while android is pretty good at loading individual assets, ios has a large
  // overhead when reading hundreds pf assets from disk
  return options.platform === 'android' && !options.indexedUnbundle
    ? asAssets(bundle, options, log)
    : asIndexedFile(bundle, options, log);
}

exports.build = buildBundle;
exports.save = saveUnbundle;
exports.formatName = 'bundle';
