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

const getAppendScripts = require('../../lib/getAppendScripts');

const {wrapModule} = require('./helpers/js');
const {getJsOutput, isJsModule} = require('./helpers/js');

import type {
  DeltaResult,
  Graph,
  Module,
  SerializerOptions,
} from '../types.flow';

function deltaJSBundle(
  entryPoint: string,
  pre: $ReadOnlyArray<Module<>>,
  delta: DeltaResult<>,
  sequenceId: string,
  graph: Graph<>,
  options: SerializerOptions,
): string {
  const outputPre = [];
  const outputPost = [];
  const outputDelta = [];

  const {processModuleFilter} = options;

  for (const module of delta.modified.values()) {
    if (isJsModule(module) && processModuleFilter(module)) {
      outputDelta.push([
        options.createModuleId(module.path),
        wrapModule(module, options),
      ]);
    }
  }

  for (const path of delta.deleted) {
    outputDelta.push([options.createModuleId(path), null]);
  }

  if (delta.reset) {
    let i = -1;

    for (const module of pre) {
      if (isJsModule(module) && processModuleFilter(module)) {
        outputPre.push([i, getJsOutput(module).data.code]);
        i--;
      }
    }

    const appendScripts = getAppendScripts(entryPoint, graph, options);

    for (const module of appendScripts) {
      if (isJsModule(module) && processModuleFilter(module)) {
        outputPost.push([
          options.createModuleId(module.path),
          getJsOutput(module).data.code,
        ]);
      }
    }
  }

  const output = {
    id: sequenceId,
    pre: outputPre,
    post: outputPost,
    delta: outputDelta,
    reset: delta.reset,
  };

  return JSON.stringify(output);
}

module.exports = deltaJSBundle;
