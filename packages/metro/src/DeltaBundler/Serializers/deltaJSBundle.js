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

import type {RevisionId} from '../../IncrementalBundler';
import type {Bundle, DeltaBundle} from '../../lib/bundle-modules/types.flow';
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
  revisionId: RevisionId,
  graph: Graph<>,
  options: SerializerOptions,
): Bundle | DeltaBundle {
  const {processModuleFilter} = options;

  const modules = [...delta.modified.values()]
    .filter(isJsModule)
    .filter(processModuleFilter)
    .map(module => [
      options.createModuleId(module.path),
      wrapModule(module, options),
    ]);

  if (delta.reset) {
    const appendScripts = getAppendScripts(entryPoint, pre, graph, options);

    return {
      base: true,
      revisionId,
      pre: pre
        .filter(isJsModule)
        .filter(processModuleFilter)
        .map(module => getJsOutput(module).data.code)
        .join('\n'),
      post: appendScripts
        .filter(isJsModule)
        .filter(processModuleFilter)
        .map(module => getJsOutput(module).data.code)
        .join('\n'),
      modules,
    };
  }

  return {
    base: false,
    revisionId,
    modules,
    deleted: [...delta.deleted].map(path => options.createModuleId(path)),
  };
}

module.exports = deltaJSBundle;
