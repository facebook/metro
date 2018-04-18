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

import type {Graph} from '../DeltaBundler/DeltaCalculator';
import type {Module} from '../DeltaBundler/traverseDependencies';

type Options<T: number | string> = {
  +createModuleId: string => T,
  +getRunModuleStatement: T => string,
  +runBeforeMainModule: $ReadOnlyArray<string>,
  +runModule: boolean,
  +sourceMapUrl: ?string,
};

function getAppendScripts<T: number | string>(
  entryPoint: string,
  graph: Graph,
  options: Options<T>,
): $ReadOnlyArray<Module> {
  const output = [];

  if (options.runModule) {
    const paths = [...options.runBeforeMainModule, entryPoint];

    for (const path of paths) {
      if (graph.dependencies.has(path)) {
        output.push({
          path: `require-${path}`,
          dependencies: new Map(),
          inverseDependencies: new Set(),
          output: {
            code: options.getRunModuleStatement(options.createModuleId(path)),
            source: '',
            map: [],
            type: 'script',
          },
        });
      }
    }
  }

  if (options.sourceMapUrl) {
    output.push({
      path: 'source-map',
      dependencies: new Map(),
      inverseDependencies: new Set(),
      output: {
        code: `//# sourceMappingURL=${options.sourceMapUrl}`,
        source: '',
        map: [],
        type: 'script',
      },
    });
  }

  return output;
}

module.exports = getAppendScripts;
