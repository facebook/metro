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

const getInlineSourceMappingURL = require('../DeltaBundler/Serializers/helpers/getInlineSourceMappingURL');
const nullthrows = require('nullthrows');
const path = require('path');
const sourceMapString = require('../DeltaBundler/Serializers/sourceMapString');

import type {Module} from '../DeltaBundler';

type Options<T: number | string> = {
  +asyncRequireModulePath: string,
  +createModuleId: string => T,
  +getRunModuleStatement: T => string,
  +inlineSourceMap: ?boolean,
  +projectRoot: string,
  +runBeforeMainModule: $ReadOnlyArray<string>,
  +runModule: boolean,
  +sourceMapUrl: ?string,
};

function getAppendScripts<T: number | string>(
  entryPoint: string,
  modules: $ReadOnlyArray<Module<>>,
  importBundleNames: Set<string>,
  options: Options<T>,
): $ReadOnlyArray<Module<>> {
  const output = [];

  if (importBundleNames.size) {
    const importBundleNamesObject = Object.create(null);
    importBundleNames.forEach(absolutePath => {
      const bundlePath = path.relative(options.projectRoot, absolutePath);
      importBundleNamesObject[options.createModuleId(absolutePath)] =
        bundlePath.slice(0, -path.extname(bundlePath).length) + '.bundle';
    });
    output.push({
      path: '$$importBundleNames',
      dependencies: new Map(),
      getSource: (): Buffer => Buffer.from(''),
      inverseDependencies: new Set(),
      output: [
        {
          type: 'js/script/virtual',
          data: {
            code: `(function(){var $$=${options.getRunModuleStatement(
              options.createModuleId(options.asyncRequireModulePath),
            )}$$.addImportBundleNames(${String(
              JSON.stringify(importBundleNamesObject),
            )})})();`,
            map: [],
          },
        },
      ],
    });
  }

  if (options.runModule) {
    const paths = [...options.runBeforeMainModule, entryPoint];

    for (const path of paths) {
      if (modules.some((module: Module<>) => module.path === path)) {
        output.push({
          path: `require-${path}`,
          dependencies: new Map(),
          getSource: (): Buffer => Buffer.from(''),
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

  if (options.inlineSourceMap || options.sourceMapUrl) {
    const sourceMappingURL = options.inlineSourceMap
      ? getInlineSourceMappingURL(
          sourceMapString(modules, {
            processModuleFilter: (): boolean => true,
            excludeSource: false,
          }),
        )
      : nullthrows(options.sourceMapUrl);

    output.push({
      path: 'source-map',
      dependencies: new Map(),
      getSource: (): Buffer => Buffer.from(''),
      inverseDependencies: new Set(),
      output: [
        {
          type: 'js/script/virtual',
          data: {
            code: `//# sourceMappingURL=${sourceMappingURL}`,
            map: [],
          },
        },
      ],
    });
  }

  return output;
}

module.exports = getAppendScripts;
