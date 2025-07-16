/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

'use strict';

import type {File} from '@babel/types';
import type {BabelTransformerArgs} from 'metro-babel-transformer';

const {getAssetData} = require('metro/private/Assets');
const {generateAssetCodeFileAst} = require('metro/private/Bundler/util');
const path = require('path');

async function transform(
  {filename, options, src}: BabelTransformerArgs,
  assetRegistryPath: string,
  assetDataPlugins: $ReadOnlyArray<string>,
): Promise<{ast: File, ...}> {
  options = options || {
    platform: '',
    projectRoot: '',
    inlineRequires: false,
    minify: false,
  };

  const absolutePath = path.resolve(options.projectRoot, filename);

  const data = await getAssetData(
    absolutePath,
    filename,
    assetDataPlugins,
    options.platform,
    options.publicPath,
  );

  return {
    ast: generateAssetCodeFileAst(assetRegistryPath, data),
  };
}

module.exports = {
  transform,
};
