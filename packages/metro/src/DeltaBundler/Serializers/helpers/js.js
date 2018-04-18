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

const addParamsToDefineCall = require('../../../lib/addParamsToDefineCall');
const path = require('path');

import type {Module} from '../../traverseDependencies';

export type Options = {
  +createModuleId: string => number | string,
  +dev: boolean,
};

// Used to include paths in production bundles for traces of performance tuned runs,
// e.g. to update fbandroid/apps/fb4a/compiled_react_native_modules.txt
// Make sure to set PRINT_REQUIRE_PATHS = true too, and restart Metro
const PASS_MODULE_PATHS_TO_DEFINE = false;

function wrapModule(module: Module, options: Options) {
  if (module.output.type === 'script') {
    return module.output.code;
  }

  const moduleId = options.createModuleId(module.path);
  const params = [
    moduleId,
    Array.from(module.dependencies.values()).map(options.createModuleId),
  ];

  // Add the module name as the last parameter (to make it easier to do
  // requires by name when debugging).
  // TODO (t26853986): Switch this to use the relative file path (once we have
  // as single project root).
  if (PASS_MODULE_PATHS_TO_DEFINE || options.dev) {
    params.push(path.basename(module.path));
    if (PASS_MODULE_PATHS_TO_DEFINE) {
      params.push(module.path);
    }
  }

  return addParamsToDefineCall(module.output.code, ...params);
}

module.exports = {
  wrapModule,
};
