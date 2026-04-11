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

import type {
  MixedOutput,
  Module,
  ReadOnlyGraph,
  SerializerOptions,
} from '../types';
import type {Bundle} from 'metro-runtime/src/modules/types';
import type {FinalizedOutput} from 'metro-transform-worker';

import getAppendScripts from '../../lib/getAppendScripts';
import processModules from './helpers/processModules';

export type TreeShakeOptions = Readonly<{
  eliminable: Set<string>,
  finalizedModules: Map<string, FinalizedOutput>,
}>;

export default function baseJSBundle(
  entryPoint: string,
  preModules: ReadonlyArray<Module<>>,
  graph: ReadOnlyGraph<>,
  options: SerializerOptions,
  treeShakeOptions?: TreeShakeOptions,
): Bundle {
  for (const module of graph.dependencies.values()) {
    options.createModuleId(module.path);
  }

  const processModulesOptions = {
    filter: (module: Module<>) => {
      if (treeShakeOptions?.eliminable.has(module.path)) {
        return false;
      }
      return options.processModuleFilter(module);
    },
    createModuleId: options.createModuleId,
    dev: options.dev,
    includeAsyncPaths: options.includeAsyncPaths,
    projectRoot: options.projectRoot,
    serverRoot: options.serverRoot,
    sourceUrl: options.sourceUrl,
  };

  if (options.modulesOnly) {
    preModules = [];
  }

  const preCode = processModules(preModules, processModulesOptions)
    .map(([_, code]) => code)
    .join('\n');

  const allModules = [...graph.dependencies.values()].sort(
    (a: Module<MixedOutput>, b: Module<MixedOutput>) =>
      options.createModuleId(a.path) - options.createModuleId(b.path),
  );

  const modules: ReadonlyArray<Module<>> =
    treeShakeOptions != null && treeShakeOptions.finalizedModules.size > 0
      ? allModules.map((module: Module<MixedOutput>) => {
          const finalized = treeShakeOptions.finalizedModules.get(module.path);
          if (finalized == null) {
            return module;
          }
          const newOutput = module.output.map((out: MixedOutput) => {
            if (!out.type.startsWith('js/')) {
              return out;
            }
            return {
              ...out,
              data: {
                ...out.data,
                code: finalized.code,
                map: finalized.map,
                lineCount: finalized.lineCount,
              },
            };
          });
          return {...module, output: newOutput};
        })
      : allModules;

  const runtimeModules = modules.filter((module: Module<>) =>
    processModulesOptions.filter(module),
  );

  const postCode = processModules(
    getAppendScripts(entryPoint, [...preModules, ...runtimeModules], {
      asyncRequireModulePath: options.asyncRequireModulePath,
      createModuleId: options.createModuleId,
      getRunModuleStatement: options.getRunModuleStatement,
      globalPrefix: options.globalPrefix,
      inlineSourceMap: options.inlineSourceMap,
      runBeforeMainModule: options.runBeforeMainModule,
      runModule: options.runModule,
      shouldAddToIgnoreList: options.shouldAddToIgnoreList,
      sourceMapUrl: options.sourceMapUrl,
      sourceUrl: options.sourceUrl,
      getSourceUrl: options.getSourceUrl,
    }),
    processModulesOptions,
  )
    .map(([_, code]) => code)
    .join('\n');

  return {
    pre: preCode,
    post: postCode,
    modules: processModules(modules, processModulesOptions).map(
      ([module, code]) => [options.createModuleId(module.path), code],
    ),
  };
}
