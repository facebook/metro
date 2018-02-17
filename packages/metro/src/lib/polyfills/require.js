/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @polyfill
 * @flow
 * @format
 */

'use strict';

/* eslint-disable no-bitwise */

declare var __DEV__: boolean;

type DependencyMap = Array<ModuleID>;
type Exports = any;
type FactoryFn = (
  global: Object,
  require: RequireFn,
  moduleObject: {exports: {}},
  exports: {},
  dependencyMap: ?DependencyMap,
) => void;
type HotModuleReloadingAcceptFn = Function;
type HotModuleReloadingData = {|
  acceptCallback: ?HotModuleReloadingAcceptFn,
  accept: (callback: HotModuleReloadingAcceptFn) => void,
|};
type Module = {
  exports: Exports,
  hot?: HotModuleReloadingData,
};
type ModuleID = number;
type ModuleDefinition = {|
  dependencyMap: ?DependencyMap,
  exports: Exports,
  factory: FactoryFn,
  hasError: boolean,
  error?: any,
  hot?: HotModuleReloadingData,
  isInitialized: boolean,
  verboseName?: string,
|};
type ModuleMap = {[key: ModuleID]: ModuleDefinition, __proto__: null};
type PatchedModules = {[ModuleID]: boolean};
type RequireFn = (id: ModuleID | VerboseModuleNameForDev) => Exports;
type VerboseModuleNameForDev = string;

global.require = require;
global.__d = define;

const modules: ModuleMap = Object.create(null);
if (__DEV__) {
  var verboseNamesToModuleIds: {
    [key: string]: number,
    __proto__: null,
  } = Object.create(null);
}

function define(
  factory: FactoryFn,
  moduleId: number,
  dependencyMap?: DependencyMap,
) {
  if (moduleId in modules) {
    if (__DEV__) {
      // (We take `inverseDependencies` from `arguments` to avoid an unused
      // named parameter in `define` in production.
      const inverseDependencies = arguments[4];

      // If the module has already been defined and the define method has been
      // called with inverseDependencies, we can hot reload it.
      if (inverseDependencies) {
        global.__accept(moduleId, factory, dependencyMap, inverseDependencies);
      } else {
        console.warn(
          `Trying to define twice module ID ${moduleId} in the same bundle`,
        );
      }
    }

    // prevent repeated calls to `global.nativeRequire` to overwrite modules
    // that are already loaded
    return;
  }
  modules[moduleId] = {
    dependencyMap,
    exports: undefined,
    factory,
    hasError: false,
    isInitialized: false,
  };
  if (__DEV__) {
    // HMR
    modules[moduleId].hot = createHotReloadingObject();

    // DEBUGGABLE MODULES NAMES
    // we take `verboseName` from `arguments` to avoid an unused named parameter
    // in `define` in production.
    const verboseName: string | void = arguments[3];
    if (verboseName) {
      modules[moduleId].verboseName = verboseName;
      verboseNamesToModuleIds[verboseName] = moduleId;
    }
  }
}

function require(moduleId: ModuleID | VerboseModuleNameForDev) {
  if (__DEV__ && typeof moduleId === 'string') {
    const verboseName = moduleId;
    moduleId = verboseNamesToModuleIds[verboseName];
    if (moduleId == null) {
      throw new Error(`Unknown named module: '${verboseName}'`);
    } else {
      console.warn(
        `Requiring module '${verboseName}' by name is only supported for ` +
          'debugging purposes and will BREAK IN PRODUCTION!',
      );
    }
  }

  //$FlowFixMe: at this point we know that moduleId is a number
  const moduleIdReallyIsNumber: number = moduleId;
  const module = modules[moduleIdReallyIsNumber];
  return module && module.isInitialized
    ? module.exports
    : guardedLoadModule(moduleIdReallyIsNumber, module);
}

let inGuard = false;
function guardedLoadModule(moduleId: ModuleID, module) {
  if (!inGuard && global.ErrorUtils) {
    inGuard = true;
    let returnValue;
    try {
      returnValue = loadModuleImplementation(moduleId, module);
    } catch (e) {
      global.ErrorUtils.reportFatalError(e);
    }
    inGuard = false;
    return returnValue;
  } else {
    return loadModuleImplementation(moduleId, module);
  }
}

const ID_MASK_SHIFT = 16;
const LOCAL_ID_MASK = ~0 >>> ID_MASK_SHIFT;

function unpackModuleId(
  moduleId: ModuleID,
): {segmentId: number, localId: number} {
  const segmentId = moduleId >>> ID_MASK_SHIFT;
  const localId = moduleId & LOCAL_ID_MASK;
  return {segmentId, localId};
}
require.unpackModuleId = unpackModuleId;

function packModuleId(value: {segmentId: number, localId: number}): ModuleID {
  return value.segmentId << (ID_MASK_SHIFT + value.localId);
}
require.packModuleId = packModuleId;

function loadModuleImplementation(moduleId, module) {
  const nativeRequire = global.nativeRequire;
  if (!module && nativeRequire) {
    const {segmentId, localId} = unpackModuleId(moduleId);
    nativeRequire(localId, segmentId);
    module = modules[moduleId];
  }

  if (!module) {
    throw unknownModuleError(moduleId);
  }

  if (module.hasError) {
    throw moduleThrewError(moduleId, module.error);
  }

  // `require` calls int  the require polyfill itself are not analyzed and
  // replaced so that they use numeric module IDs.
  // The systrace module will expose itself on the require function so that
  // it can be used here.
  // TODO(davidaurelio) Scan polyfills for dependencies, too (t9759686)
  if (__DEV__) {
    var {Systrace} = require;
  }

  // We must optimistically mark module as initialized before running the
  // factory to keep any require cycles inside the factory from causing an
  // infinite require loop.
  module.isInitialized = true;
  const exports = (module.exports = {});
  const {factory, dependencyMap} = module;
  try {
    if (__DEV__) {
      // $FlowFixMe: we know that __DEV__ is const and `Systrace` exists
      Systrace.beginEvent('JS_require_' + (module.verboseName || moduleId));
    }

    const moduleObject: Module = {exports};
    if (__DEV__ && module.hot) {
      moduleObject.hot = module.hot;
    }

    // keep args in sync with with defineModuleCode in
    // metro/src/Resolver/index.js
    // and metro/src/ModuleGraph/worker.js
    factory(global, require, moduleObject, exports, dependencyMap);

    // avoid removing factory in DEV mode as it breaks HMR
    if (!__DEV__) {
      // $FlowFixMe: This is only sound because we never access `factory` again
      module.factory = undefined;
      module.dependencyMap = undefined;
    }

    if (__DEV__) {
      // $FlowFixMe: we know that __DEV__ is const and `Systrace` exists
      Systrace.endEvent();
    }
    return (module.exports = moduleObject.exports);
  } catch (e) {
    module.hasError = true;
    module.error = e;
    module.isInitialized = false;
    module.exports = undefined;
    throw e;
  }
}

function unknownModuleError(id) {
  let message = 'Requiring unknown module "' + id + '".';
  if (__DEV__) {
    message +=
      'If you are sure the module is there, try restarting Metro Bundler. ' +
      'You may also want to run `yarn`, or `npm install` (depending on your environment).';
  }
  return Error(message);
}

function moduleThrewError(id, error: any) {
  const displayName = (__DEV__ && modules[id] && modules[id].verboseName) || id;
  return Error(
    'Requiring module "' +
      displayName +
      '", which threw an exception: ' +
      error,
  );
}

if (__DEV__) {
  require.Systrace = {beginEvent: () => {}, endEvent: () => {}};

  require.getModules = () => {
    return modules;
  };

  // HOT MODULE RELOADING
  var createHotReloadingObject = function() {
    const hot: HotModuleReloadingData = {
      acceptCallback: null,
      accept: callback => {
        hot.acceptCallback = callback;
      },
    };
    return hot;
  };

  const acceptAll = function(
    dependentModules,
    inverseDependencies,
    patchedModules,
  ) {
    if (!dependentModules || dependentModules.length === 0) {
      return true;
    }

    const notAccepted = dependentModules.filter(
      module =>
        !accept(
          module,
          /*factory*/ undefined,
          /*dependencyMap*/ undefined,
          inverseDependencies,
          patchedModules,
        ),
    );

    const parents = [];
    for (let i = 0; i < notAccepted.length; i++) {
      // if the module has no parents then the change cannot be hot loaded
      if (inverseDependencies[notAccepted[i]].length === 0) {
        return false;
      }

      parents.push(...inverseDependencies[notAccepted[i]]);
    }

    return parents.length == 0;
  };

  const accept = function(
    id: ModuleID,
    factory?: FactoryFn,
    dependencyMap?: DependencyMap,
    inverseDependencies: {[key: ModuleID]: Array<ModuleID>},
    patchedModules: PatchedModules = {},
  ) {
    if (id in patchedModules) {
      // Do not patch the same module more that once during an update.
      return true;
    }
    patchedModules[id] = true;

    const mod = modules[id];

    if (!mod && factory) {
      // New modules are going to be handled by the define() method.
      return true;
    }

    const {hot} = mod;
    if (!hot) {
      console.warn(
        'Cannot accept module because Hot Module Replacement ' +
          'API was not installed.',
      );
      return false;
    }

    // replace and initialize factory
    if (factory) {
      mod.factory = factory;
    }
    if (dependencyMap) {
      mod.dependencyMap = dependencyMap;
    }
    mod.hasError = false;
    mod.isInitialized = false;
    require(id);

    if (hot.acceptCallback) {
      hot.acceptCallback();
      return true;
    } else {
      // need to have inverseDependencies to bubble up accept
      if (!inverseDependencies) {
        throw new Error('Undefined `inverseDependencies`');
      }

      // accept parent modules recursively up until all siblings are accepted
      return acceptAll(
        inverseDependencies[id],
        inverseDependencies,
        patchedModules,
      );
    }
  };

  global.__accept = accept;
}
