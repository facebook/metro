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

import type {Visitors as ConstantFoldingPluginVisitors} from './constant-folding-plugin';
import type {Visitors as ImportExportPluginVisitors} from './import-export-plugin';
import type {
  Visitors as InlinePluginVisitors,
  Options as InlinePluginOptions,
} from './inline-plugin';
import typeof {types as BabelTypes} from '@babel/core';
import type {Ast} from '@babel/core';

type BabelPlugin<VisitorT, OptionsT> = (
  context: {types: BabelTypes, ...},
  options: OptionsT,
) => VisitorT;

type TransformPlugins = {
  constantFoldingPlugin: BabelPlugin<ConstantFoldingPluginVisitors, {}>,
  importExportPlugin: BabelPlugin<ImportExportPluginVisitors, {}>,
  inlinePlugin: BabelPlugin<InlinePluginVisitors, InlinePluginOptions>,
  normalizePseudoGlobals(ast: Ast): $ReadOnlyArray<string>,
  getTransformPluginCacheKeyFiles(): $ReadOnlyArray<string>,
};

module.exports = ({
  constantFoldingPlugin: require('./constant-folding-plugin'),
  importExportPlugin: require('./import-export-plugin'),
  inlinePlugin: require('./inline-plugin'),
  normalizePseudoGlobals: require('./normalizePseudoGlobals'),
  getTransformPluginCacheKeyFiles: () => [
    require.resolve(__filename),
    require.resolve('./constant-folding-plugin'),
    require.resolve('./import-export-plugin'),
    require.resolve('./inline-plugin'),
    require.resolve('./normalizePseudoGlobals'),
  ],
}: TransformPlugins);
