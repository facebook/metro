/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import type {Module} from '../types';

import getSourceMapInfo from './helpers/getSourceMapInfo';
import {isJsModule} from './helpers/js';
import {fromRawMappings, fromRawMappingsNonBlocking} from 'metro-source-map';

export type SourceMapGeneratorOptions = $ReadOnly<{
  excludeSource: boolean,
  processModuleFilter: (module: Module<>) => boolean,
  shouldAddToIgnoreList: (module: Module<>) => boolean,
  getSourceUrl: ?(module: Module<>) => string,
}>;

function getSourceMapInfosImpl(
  isBlocking: boolean,
  onDone: ($ReadOnlyArray<ReturnType<typeof getSourceMapInfo>>) => void,
  modules: $ReadOnlyArray<Module<>>,
  options: SourceMapGeneratorOptions,
): void {
  const sourceMapInfos = [];
  const modulesToProcess = modules
    .filter(isJsModule)
    .filter(options.processModuleFilter);

  function processNextModule() {
    if (modulesToProcess.length === 0) {
      return true;
    }

    const mod = modulesToProcess.shift();
    // $FlowFixMe[incompatible-type]
    const info = getSourceMapInfo(mod, {
      excludeSource: options.excludeSource,
      shouldAddToIgnoreList: options.shouldAddToIgnoreList,
      getSourceUrl: options.getSourceUrl,
    });
    sourceMapInfos.push(info);
    return false;
  }

  function workLoop() {
    const time = process.hrtime();
    while (true) {
      const isDone = processNextModule();
      if (isDone) {
        onDone(sourceMapInfos);
        break;
      }
      if (!isBlocking) {
        // Keep the loop running but try to avoid blocking
        // for too long because this is not in a worker yet.
        const diff = process.hrtime(time);
        const NS_IN_MS = 1000000;
        if (diff[1] > 50 * NS_IN_MS) {
          // We've blocked for more than 50ms.
          // This code currently runs on the main thread,
          // so let's give Metro an opportunity to handle requests.
          setImmediate(workLoop);
          break;
        }
      }
    }
  }
  workLoop();
}

function sourceMapGenerator(
  modules: $ReadOnlyArray<Module<>>,
  options: SourceMapGeneratorOptions,
): ReturnType<typeof fromRawMappings> {
  let sourceMapInfos;
  getSourceMapInfosImpl(
    true,
    infos => {
      sourceMapInfos = infos;
    },
    modules,
    options,
  );
  if (sourceMapInfos == null) {
    throw new Error(
      'Expected getSourceMapInfosImpl() to finish synchronously.',
    );
  }
  return fromRawMappings(sourceMapInfos);
}

async function sourceMapGeneratorNonBlocking(
  modules: $ReadOnlyArray<Module<>>,
  options: SourceMapGeneratorOptions,
): ReturnType<typeof fromRawMappingsNonBlocking> {
  const sourceMapInfos = await new Promise<
    $ReadOnlyArray<ReturnType<typeof getSourceMapInfo>>,
  >(resolve => {
    getSourceMapInfosImpl(false, resolve, modules, options);
  });
  return fromRawMappingsNonBlocking(sourceMapInfos);
}

export {sourceMapGenerator, sourceMapGeneratorNonBlocking};
