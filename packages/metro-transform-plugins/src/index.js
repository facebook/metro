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

import typeof ConstantFoldingPlugin from './constant-folding-plugin';
import typeof ImportExportPlugin from './import-export-plugin';
import typeof InlinePlugin from './inline-plugin';
import typeof NormalizePseudoGlobalsFn from './normalizePseudoGlobals';

export type {Options as InlinePluginOptions} from './inline-plugin';

type TransformPlugins = {
  addParamsToDefineCall(string, ...Array<mixed>): string,
  constantFoldingPlugin: ConstantFoldingPlugin,
  importExportPlugin: ImportExportPlugin,
  inlinePlugin: InlinePlugin,
  normalizePseudoGlobals: NormalizePseudoGlobalsFn,
  getTransformPluginCacheKeyFiles(): $ReadOnlyArray<string>,
};

module.exports = ({
  // $FlowIgnore[unsafe-getters-setters]
  get addParamsToDefineCall() {
    return require('./addParamsToDefineCall');
  },
  // $FlowIgnore[unsafe-getters-setters]
  get constantFoldingPlugin() {
    return require('./constant-folding-plugin');
  },
  // $FlowIgnore[unsafe-getters-setters]
  get importExportPlugin() {
    return require('./import-export-plugin');
  },
  // $FlowIgnore[unsafe-getters-setters]
  get inlinePlugin() {
    return require('./inline-plugin');
  },
  // $FlowIgnore[unsafe-getters-setters]
  get normalizePseudoGlobals() {
    return require('./normalizePseudoGlobals');
  },
  getTransformPluginCacheKeyFiles: () => [
    require.resolve(__filename),
    require.resolve('./constant-folding-plugin'),
    require.resolve('./import-export-plugin'),
    require.resolve('./inline-plugin'),
    require.resolve('./normalizePseudoGlobals'),
  ],
}: TransformPlugins);
