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

const sourceMapString = require('../DeltaBundler/Serializers/sourceMapString');

import type {Graph, Module} from '../DeltaBundler';

type Options<T: number | string> = {
  +createModuleId: string => T,
  +getRunModuleStatement: T => string,
  +runBeforeMainModule: $ReadOnlyArray<string>,
  +runModule: boolean,
  +sourceMapUrl: ?string,
  +inlineSourceMap: ?boolean,
};

function getAppendScripts<T: number | string>(
  entryPoint: string,
  pre: $ReadOnlyArray<Module<>>,
  graph: Graph<>,
  options: Options<T>,
): $ReadOnlyArray<Module<>> {
  const output = [];

  if (options.runModule) {
    const paths = [...options.runBeforeMainModule, entryPoint];

    for (const path of paths) {
      if (graph.dependencies.has(path)) {
        output.push({
          path: `require-${path}`,
          dependencies: new Map(),
          getSource: () => Buffer.from(''),
          inverseDependencies: new Set(),
          output: [
            {
              type: 'js/script/virtual',
              data: {
                code: options.getRunModuleStatement(
                  options.createModuleId(path),
                ),
                map: [],
              },
            },
          ],
        });
      }
    }
  }

  if (options.inlineSourceMap) {
    const sourceMap = Buffer.from(
      sourceMapString(pre, graph, {
        processModuleFilter: () => true,
        excludeSource: false,
      }),
    ).toString('base64');

    output.push({
      path: 'source-map',
      dependencies: new Map(),
      getSource: () => Buffer.from(''),
      inverseDependencies: new Set(),
      output: [
        {
          type: 'js/script/virtual',
          data: {
            code: `//# sourceMappingURL=data:application/json;charset=utf-8;base64,${sourceMap}`,
            map: [],
          },
        },
      ],
    });
  } else if (options.sourceMapUrl) {
    output.push({
      path: 'source-map',
      dependencies: new Map(),
      getSource: () => Buffer.from(''),
      inverseDependencies: new Set(),
      output: [
        {
          type: 'js/script/virtual',
          data: {
            code: `//# sourceMappingURL=${options.sourceMapUrl}`,
            map: [],
          },
        },
      ],
    });
  }

  return output;
}

module.exports = getAppendScripts;
