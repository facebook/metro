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

const {wrapModule} = require('./helpers/js');

import type {Graph} from '../DeltaCalculator';
import type {DependencyEdge} from '../traverseDependencies';

type Options = {|
  createModuleIdFn: string => number | string,
  +dev: boolean,
  +runBeforeMainModule: $ReadOnlyArray<string>,
  +runModule: boolean,
  +sourceMapUrl: ?string,
|};

function plainJSBundle(
  entryPoint: string,
  pre: $ReadOnlyArray<DependencyEdge>,
  graph: Graph,
  options: Options,
): string {
  const output = [];

  for (const module of pre) {
    output.push(wrapModule(module, options));
  }

  for (const module of graph.dependencies.values()) {
    output.push(wrapModule(module, options));
  }

  for (const path of options.runBeforeMainModule) {
    if (graph.dependencies.has(path)) {
      output.push(
        `require(${JSON.stringify(options.createModuleIdFn(path))});`,
      );
    }
  }

  if (options.runModule && graph.dependencies.has(entryPoint)) {
    output.push(
      `require(${JSON.stringify(options.createModuleIdFn(entryPoint))});`,
    );
  }

  if (options.sourceMapUrl) {
    output.push(`//# sourceMappingURL=${options.sourceMapUrl}`);
  }

  return output.join('\n');
}

module.exports = plainJSBundle;
