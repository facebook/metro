/**
 * Copyright (c) 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 */
'use strict';

const virtualModule = require('../module').virtual;

import type {IdForPathFn, Module} from '../types.flow';

// Transformed modules have the form
//   __d(function(require, module, global, exports, dependencyMap) {
//       /* code */
//   });
//
// This function adds the numeric module ID, and an array with dependencies of
// the dependencies of the module before the closing parenthesis.
function addModuleIdsToModuleWrapper(
  module: Module,
  idForPath: {path: string} => number,
): string {
  const {dependencies, file} = module;
  const {code} = file;
  const index = code.lastIndexOf(')');

  // calling `idForPath` on the module itself first gives us a lower module id
  // for the file itself than for its dependencies. That reflects their order
  // in the bundle.
  const fileId = idForPath(file);

  // This code runs for both development and production builds, after
  // minification. That's why we leave out all spaces.
  const depencyIds =
    dependencies.length ? `,[${dependencies.map(idForPath).join(',')}]` : '';
  return (
    code.slice(0, index) +
    `,${fileId}` +
    depencyIds +
    code.slice(index)
  );
}

exports.addModuleIdsToModuleWrapper = addModuleIdsToModuleWrapper;

// Adds the module ids to a file if the file is a module. If it's not (e.g. a
// script) it just keeps it as-is.
function getModuleCode(
  module: Module,
  idForPath: IdForPathFn,
) {
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
exports.createIdForPathFn = (): ({path: string} => number) => {
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
exports.requireCallsTo = function* (
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
exports.toModuleTransport = (
  module: Module,
  idForPath: IdForPathFn,
) => {
  const {dependencies, file} = module;
  return {
    code: getModuleCode(module, idForPath),
    dependencies,
    id: idForPath(file),
    map: file.map,
    name: file.path,
    sourcePath: file.path,
  };
};
