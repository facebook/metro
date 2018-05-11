/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

import type {Graph, Module} from '../DeltaBundler';

type Options<T: number | string> = {
  +createModuleId: string => T,
  +getRunModuleStatement: T => string,
  +runBeforeMainModule: $ReadOnlyArray<string>,
  +runModule: boolean,
  +sourceMapUrl: ?string,
};

function getAppendScripts<T: number | string>(
  entryPoint: string,
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
          getSource: () => '',
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

  if (options.sourceMapUrl) {
    output.push({
      path: 'source-map',
      dependencies: new Map(),
      getSource: () => '',
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
