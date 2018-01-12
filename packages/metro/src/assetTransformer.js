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

const {getAssetData} = require('./Assets');
const {generateAssetCodeFileAst} = require('./Bundler/util');

import type {TransformOptions} from './JSTransformer/worker';
import type {Ast} from 'babel-core';

type Params = {
  localPath: string,
  filename: string,
  options: TransformOptions,
  src: string,
};

async function transform(
  {filename, localPath, options, src}: Params,
  assetRegistryPath: string,
  assetDataPlugins: $ReadOnlyArray<string>,
): Promise<{ast: Ast}> {
  options = options || {
    platform: '',
    projectRoot: '',
    inlineRequires: false,
    minify: false,
  };

  const data = await getAssetData(
    filename,
    localPath,
    assetDataPlugins,
    options.platform,
  );

  return {
    ast: generateAssetCodeFileAst(assetRegistryPath, data),
  };
}

module.exports = {
  transform,
};
