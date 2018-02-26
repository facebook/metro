/**
 * Copyright (c) 2016-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

'use strict';

const constantFoldingPlugin = require('../../JSTransformer/worker/constant-folding-plugin');
const generate = require('./generate');
const getMinifier = require('../../lib/getMinifier');
const inlinePlugin = require('../../JSTransformer/worker/inline-plugin');
const invariant = require('fbjs/lib/invariant');
const optimizeDependencies = require('./optimizeDependencies');
const sourceMap = require('source-map');

const {transformSync} = require('../../babel-bridge');

import type {PostMinifyProcess} from '../../Bundler/index.js';
import type {TransformedSourceFile, TransformResult} from '../types.flow';
import type {BabelSourceMap} from '@babel/core';
import type {TransformResult as BabelTransformResult} from '@babel/core';
import type {MetroSourceMap} from 'metro-source-map';

export type OptimizationOptions = {|
  dev: boolean,
  isPolyfill?: boolean,
  minifierPath: string,
  platform: string,
  postMinifyProcess: PostMinifyProcess,
|};

function optimizeModule(
  content: Buffer,
  optimizationOptions: OptimizationOptions,
): TransformedSourceFile {
  const data: TransformedSourceFile = JSON.parse(content.toString('utf8'));

  if (data.type !== 'code') {
    return data;
  }

  const {details} = data;
  const {file, transformed} = details;
  const result = {...details, transformed: {}};
  const {postMinifyProcess} = optimizationOptions;

  Object.entries(transformed).forEach(([k, t: TransformResult]) => {
    const optimized = optimize((t: $FlowFixMe), file, optimizationOptions);
    const processed = postMinifyProcess({
      code: optimized.code,
      map: optimized.map,
    });
    optimized.code = processed.code;
    optimized.map = processed.map;
    result.transformed[k] = optimized;
  });

  return {type: 'code', details: result};
}

function optimize(
  transformed: TransformResult,
  file,
  options,
): TransformResult {
  const {code, dependencyMapName, map} = transformed;
  const optimized = optimizeCode(code, map, file, options);

  let dependencies;
  if (options.isPolyfill) {
    dependencies = [];
  } else {
    if (dependencyMapName == null) {
      invariant(
        transformed.dependencies.length === 0,
        'there should be no dependency is the map name is missing',
      );
      dependencies = [];
    } else {
      dependencies = optimizeDependencies(
        optimized.ast,
        transformed.dependencies,
        dependencyMapName,
        transformed.requireName,
      );
    }
  }

  const inputMap = transformed.map;
  const gen = generate(optimized.ast, file, '', true);

  const minify = getMinifier(options.minifierPath);
  const min = minify.withSourceMap(
    gen.code,
    inputMap && gen.map && mergeSourceMaps(file, inputMap, gen.map),
    file,
  );
  return {
    code: min.code,
    map: min.map,
    dependencies,
    requireName: transformed.requireName,
  };
}

function optimizeCode(
  code,
  map,
  filename,
  inliningOptions,
): BabelTransformResult {
  return transformSync(code, {
    plugins: [
      [constantFoldingPlugin],
      [inlinePlugin, {...inliningOptions, isWrapped: true}],
    ],
    babelrc: false,
    code: false,
    filename,
  });
}

function mergeSourceMaps(
  file: string,
  originalMap: MetroSourceMap,
  secondMap: MetroSourceMap,
): BabelSourceMap {
  const merged = new sourceMap.SourceMapGenerator();
  const inputMap = new sourceMap.SourceMapConsumer(originalMap);
  new sourceMap.SourceMapConsumer(secondMap).eachMapping(mapping => {
    const original = inputMap.originalPositionFor({
      line: mapping.originalLine,
      column: mapping.originalColumn,
    });
    if (original.line == null) {
      return;
    }

    merged.addMapping({
      generated: {line: mapping.generatedLine, column: mapping.generatedColumn},
      original: {line: original.line, column: original.column || 0},
      source: file,
      name: original.name || mapping.name,
    });
  });
  return merged.toJSON();
}

module.exports = optimizeModule;
