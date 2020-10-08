/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const path = require('path');

const {getAssetData} = require('metro/src/Assets');
const {generateAssetCodeFileAst} = require('metro/src/Bundler/util');

import type {File} from '@babel/types';
import type {BabelTransformerArgs} from 'metro-babel-transformer';

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
