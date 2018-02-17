/**
 * Copyright (c) 2016-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const addParamsToDefineCall = require('../../lib/addParamsToDefineCall');
const virtualModule = require('../module').virtual;

import type {IdsForPathFn, Module} from '../types.flow';

// Transformed modules have the form
//   __d(function(require, module, global, exports, dependencyMap) {
//       /* code */
//   });
//
// This function adds the numeric module ID, and an array with dependencies of
// the dependencies of the module before the closing parenthesis.
function addModuleIdsToModuleWrapper(
  module: Module,
  idForPath: ({path: string}) => number,
): string {
  const {dependencies, file} = module;
  const {code} = file;

  // calling `idForPath` on the module itself first gives us a lower module id
  // for the file itself than for its dependencies. That reflects their order
  // in the bundle.
  const fileId = idForPath(file);

  const paramsToAdd = [fileId];

  if (dependencies.length) {
    paramsToAdd.push(dependencies.map(idForPath));
  }

  return addParamsToDefineCall(code, ...paramsToAdd);
}

exports.addModuleIdsToModuleWrapper = addModuleIdsToModuleWrapper;

type IdForPathFn = ({path: string}) => number;

// Adds the module ids to a file if the file is a module. If it's not (e.g. a
// script) it just keeps it as-is.
function getModuleCode(module: Module, idForPath: IdForPathFn) {
  const {file} = module;
  return file.type === 'module'
    ? addModuleIdsToModuleWrapper(module, idForPath)
    : file.code;
}

exports.getModuleCode = getModuleCode;

// Concatenates many iterables, by calling them sequentially.
exports.concat = function* concat<T>(
  ...iterables: Array<Iterable<T>>
): Iterable<T> {
  for (const it of iterables) {
    yield* it;
  }
};

// Creates an idempotent function that returns numeric IDs for objects based
// on their `path` property.
exports.createIdForPathFn = (): (({path: string}) => number) => {
  const seen = new Map();
  let next = 0;
  return ({path}) => {
    let id = seen.get(path);
    if (id == null) {
      id = next++;
      seen.set(path, id);
    }
    return id;
  };
};

// creates a series of virtual modules with require calls to the passed-in
// modules.
exports.requireCallsTo = function*(
  modules: Iterable<Module>,
  idForPath: IdForPathFn,
): Iterable<Module> {
  for (const module of modules) {
    yield virtualModule(`require(${idForPath(module.file)});`);
  }
};

// Divides the modules into two types: the ones that are loaded at startup, and
// the ones loaded deferredly (lazy loaded).
exports.partition = (
  modules: Iterable<Module>,
  preloadedModules: Set<string>,
): Array<Array<Module>> => {
  const startup = [];
  const deferred = [];
  for (const module of modules) {
    (preloadedModules.has(module.file.path) ? startup : deferred).push(module);
  }

  return [startup, deferred];
};

// Transforms a new Module object into an old one, so that it can be passed
// around code.
exports.toModuleTransport = (module: Module, idsForPath: IdsForPathFn) => {
  const {dependencies, file} = module;
  return {
    code: getModuleCode(module, x => idsForPath(x).moduleId),
    dependencies,
    // ID is required but we provide an invalid one for "script"s.
    id: file.type === 'module' ? idsForPath(file).localId : -1,
    map: file.map,
    name: file.path,
    sourcePath: file.path,
  };
};
