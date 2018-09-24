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

const JsTransformer = require('./worker');

import type {DynamicRequiresBehavior} from '../ModuleGraph/worker/collectDependencies';
import type {Type, JsOutput} from './worker';
import type {TransformResultDependency} from 'metro/src/DeltaBundler';

export type WorkerOptions = {|
  +assetPlugins: $ReadOnlyArray<string>,
  +assetRegistryPath: string,
  +asyncRequireModulePath: string,
  +babelTransformerPath: string,
  +dynamicDepsInPackages: DynamicRequiresBehavior,
  +minifierPath: string,
  +optimizationSizeLimit: number,
  +transformOptions: TransformOptions,
  +type: Type,
|};

export type CustomTransformOptions = {[string]: mixed, __proto__: null};

export type TransformOptions = {
  +customTransformOptions?: CustomTransformOptions,
  +enableBabelRCLookup?: boolean,
  +experimentalImportSupport?: boolean,
  +dev: boolean,
  +hot?: boolean,
  +inlineRequires: boolean,
  +minify: boolean,
  +platform: ?string,
  +projectRoot: string,
};

type Result = {|
  output: $ReadOnlyArray<JsOutput>,
  dependencies: $ReadOnlyArray<TransformResultDependency>,
|};

async function transform(
  filename: string,
  data: Buffer,
  options: WorkerOptions,
): Promise<Result> {
  const transformerConfig = {
    assetPlugins: options.assetPlugins,
    assetRegistryPath: options.assetRegistryPath,
    asyncRequireModulePath: options.asyncRequireModulePath,
    babelTransformerPath: options.babelTransformerPath,
    dynamicDepsInPackages: options.dynamicDepsInPackages,
    minifierPath: options.minifierPath,
    optimizationSizeLimit: options.optimizationSizeLimit,
  };

  const transformOptions = {
    customTransformOptions: options.transformOptions.customTransformOptions,
    dev: options.transformOptions.dev,
    enableBabelRCLookup: options.transformOptions.enableBabelRCLookup,
    experimentalImportSupport:
      options.transformOptions.experimentalImportSupport,
    hot: !!options.transformOptions.hot,
    inlineRequires: options.transformOptions.inlineRequires,
    minify: options.transformOptions.minify,
    platform: options.transformOptions.platform,
    type: options.type,
  };

  const transformer = new JsTransformer(
    options.transformOptions.projectRoot,
    transformerConfig,
  );

  return await transformer.transform(filename, data, transformOptions);
}

function getTransformDependencies(): $ReadOnlyArray<string> {
  return JsTransformer.getTransformDependencies();
}

module.exports = {
  transform,
  getTransformDependencies,
};
