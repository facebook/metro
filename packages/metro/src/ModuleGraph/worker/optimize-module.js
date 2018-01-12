/**
 * Copyright (c) 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 * @flow
 */

'use strict';

const babel = require('babel-core');
const constantFolding = require('../../JSTransformer/worker/constant-folding')
  .plugin;
const generate = require('./generate');
const inline = require('../../JSTransformer/worker/inline').plugin;
const invariant = require('fbjs/lib/invariant');
const minify = require('../../JSTransformer/worker/minify');
const optimizeDependencies = require('./optimizeDependencies');
const sourceMap = require('source-map');

import type {TransformedSourceFile, TransformResult} from '../types.flow';
import type {BabelSourceMap} from 'babel-core';
import type {MetroSourceMap} from 'metro-source-map';
import type {PostMinifyProcess} from '../../Bundler/index.js';

export type OptimizationOptions = {|
  dev: boolean,
  isPolyfill?: boolean,
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

function optimize(transformed: TransformResult, file, options) {
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
      );
    }
  }

  const inputMap = transformed.map;
  const gen = generate(optimized.ast, file, '', true);

  const min = minify.withSourceMap(
    gen.code,
    inputMap && gen.map && mergeSourceMaps(file, inputMap, gen.map),
    file,
  );
  return {code: min.code, map: min.map, dependencies};
}

function optimizeCode(code, map, filename, inliningOptions) {
  return babel.transform(code, {
    plugins: [
      [constantFolding],
      [inline, {...inliningOptions, isWrapped: true}],
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
