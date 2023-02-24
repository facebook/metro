/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

'use strict';
import type {Module} from '../DeltaBundler';
import type {Dependency} from '../DeltaBundler/types.flow';

import CountingSet from './CountingSet';

const getInlineSourceMappingURL = require('../DeltaBundler/Serializers/helpers/getInlineSourceMappingURL');
const sourceMapString = require('../DeltaBundler/Serializers/sourceMapString');
const countLines = require('./countLines');
const nullthrows = require('nullthrows');

type Options<T: number | string> = {
  +asyncRequireModulePath: string,
  +createModuleId: string => T,
  +getRunModuleStatement: T => string,
  +inlineSourceMap: ?boolean,
  +runBeforeMainModule: $ReadOnlyArray<string>,
  +runModule: boolean,
  +sourceMapUrl: ?string,
  +sourceUrl: ?string,
  ...
};

function getAppendScripts<T: number | string>(
  entryPoint: string,
  modules: $ReadOnlyArray<Module<>>,
  options: Options<T>,
): $ReadOnlyArray<Module<>> {
  const output: Array<Module<>> = [];

  if (options.runModule) {
    const paths = [...options.runBeforeMainModule, entryPoint];

    for (const path of paths) {
      if (modules.some((module: Module<>) => module.path === path)) {
        const code = options.getRunModuleStatement(
          options.createModuleId(path),
        );
        output.push({
          path: `require-${path}`,
          dependencies: new Map(),
          getSource: (): Buffer => Buffer.from(''),
          inverseDependencies: new CountingSet(),
          output: [
            {
              type: 'js/script/virtual',
              data: {
                code,
                lineCount: countLines(code),
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

    const code = `//# sourceMappingURL=${sourceMappingURL}`;
    output.push({
      path: 'source-map',
      dependencies: new Map<string, Dependency>(),
      getSource: (): Buffer => Buffer.from(''),
      inverseDependencies: new CountingSet(),
      output: [
        {
          type: 'js/script/virtual',
          data: {
            code,
            lineCount: countLines(code),
            map: [],
          },
        },
      ],
    });
  }

  if (options.sourceUrl) {
    const code = `//# sourceURL=${options.sourceUrl}`;
    output.push({
      path: 'source-url',
      dependencies: new Map<string, Dependency>(),
      getSource: (): Buffer => Buffer.from(''),
      inverseDependencies: new CountingSet(),
      output: [
        {
          type: 'js/script/virtual',
          data: {
            code,
            lineCount: countLines(code),
            map: [],
          },
        },
      ],
    });
  }

  return output;
}

module.exports = getAppendScripts;
