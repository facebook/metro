var __BUNDLE_START_TIME__=globalThis.nativePerformanceNow?nativePerformanceNow():Date.now(),__DEV__=true,process=globalThis.process||{},__METRO_GLOBAL_PREFIX__='',__requireCycleIgnorePatterns=[/(^|\/|\\)node_modules($|\/|\\)/];process.env=process.env||{};process.env.NODE_ENV=process.env.NODE_ENV||"development";
(function (global) {
  'use strict';

  global.__r = metroRequire;
  global[`${__METRO_GLOBAL_PREFIX__}__d`] = define;
  global.__c = clear;
  global.__registerSegment = registerSegment;
  var modules = clear();
  const EMPTY = {};
  const CYCLE_DETECTED = {};
  const {
    hasOwnProperty
  } = {};
  if (__DEV__) {
    global.$RefreshReg$ = global.$RefreshReg$ ?? (() => {});
    global.$RefreshSig$ = global.$RefreshSig$ ?? (() => type => type);
  }
  function clear() {
    modules = new Map();
    return modules;
  }
  if (__DEV__) {
    var verboseNamesToModuleIds = new Map();
    var getModuleIdForVerboseName = verboseName => {
      const moduleId = verboseNamesToModuleIds.get(verboseName);
      if (moduleId == null) {
        throw new Error(`Unknown named module: "${verboseName}"`);
      }
      return moduleId;
    };
    var initializingModuleIds = [];
  }
  function define(factory, moduleId, dependencyMap) {
    if (modules.has(moduleId)) {
      if (__DEV__) {
        const inverseDependencies = arguments[4];
        if (inverseDependencies) {
          global.__accept(moduleId, factory, dependencyMap, inverseDependencies);
        }
      }
      return;
    }
    const mod = {
      dependencyMap,
      factory,
      hasError: false,
      importedAll: EMPTY,
      importedDefault: EMPTY,
      isInitialized: false,
      publicModule: {
        exports: {}
      }
    };
    modules.set(moduleId, mod);
    if (__DEV__) {
      mod.hot = createHotReloadingObject();
      const verboseName = arguments[3];
      if (verboseName) {
        mod.verboseName = verboseName;
        verboseNamesToModuleIds.set(verboseName, moduleId);
      }
    }
  }
  function metroRequire(moduleId, maybeNameForDev) {
    if (moduleId === null) {
      if (__DEV__ && typeof maybeNameForDev === 'string') {
        throw new Error("Cannot find module '" + maybeNameForDev + "'");
      }
      throw new Error('Cannot find module');
    }
    if (__DEV__ && typeof moduleId === 'string') {
      const verboseName = moduleId;
      moduleId = getModuleIdForVerboseName(verboseName);
      console.warn(`Requiring module "${verboseName}" by name is only supported for ` + 'debugging purposes and will BREAK IN PRODUCTION!');
    }
    const moduleIdReallyIsNumber = moduleId;
    if (__DEV__) {
      const initializingIndex = initializingModuleIds.indexOf(moduleIdReallyIsNumber);
      if (initializingIndex !== -1) {
        const cycle = initializingModuleIds.slice(initializingIndex).map(id => modules.get(id)?.verboseName ?? '[unknown]');
        if (shouldPrintRequireCycle(cycle)) {
          cycle.push(cycle[0]);
          console.warn(`Require cycle: ${cycle.join(' -> ')}\n\n` + 'Require cycles are allowed, but can result in uninitialized values. ' + 'Consider refactoring to remove the need for a cycle.');
        }
      }
    }
    const module = modules.get(moduleIdReallyIsNumber);
    return module && module.isInitialized ? module.publicModule.exports : guardedLoadModule(moduleIdReallyIsNumber, module);
  }
  function shouldPrintRequireCycle(modules) {
    const regExps = global[__METRO_GLOBAL_PREFIX__ + '__requireCycleIgnorePatterns'];
    if (!Array.isArray(regExps)) {
      return true;
    }
    const isIgnored = module => module != null && regExps.some(regExp => regExp.test(module));
    return modules.every(module => !isIgnored(module));
  }
  function metroImportDefault(moduleId) {
    if (__DEV__ && typeof moduleId === 'string') {
      const verboseName = moduleId;
      moduleId = getModuleIdForVerboseName(verboseName);
    }
    const moduleIdReallyIsNumber = moduleId;
    const maybeInitializedModule = modules.get(moduleIdReallyIsNumber);
    if (maybeInitializedModule && maybeInitializedModule.importedDefault !== EMPTY) {
      return maybeInitializedModule.importedDefault;
    }
    const exports = metroRequire(moduleIdReallyIsNumber);
    const importedDefault = exports && exports.__esModule ? exports.default : exports;
    const initializedModule = modules.get(moduleIdReallyIsNumber);
    return initializedModule.importedDefault = importedDefault;
  }
  metroRequire.importDefault = metroImportDefault;
  function metroImportAll(moduleId) {
    if (__DEV__ && typeof moduleId === 'string') {
      const verboseName = moduleId;
      moduleId = getModuleIdForVerboseName(verboseName);
    }
    const moduleIdReallyIsNumber = moduleId;
    const maybeInitializedModule = modules.get(moduleIdReallyIsNumber);
    if (maybeInitializedModule && maybeInitializedModule.importedAll !== EMPTY) {
      return maybeInitializedModule.importedAll;
    }
    const exports = metroRequire(moduleIdReallyIsNumber);
    let importedAll;
    if (exports && exports.__esModule) {
      importedAll = exports;
    } else {
      importedAll = {};
      if (exports) {
        for (const key in exports) {
          if (hasOwnProperty.call(exports, key)) {
            importedAll[key] = exports[key];
          }
        }
      }
      importedAll.default = exports;
    }
    const initializedModule = modules.get(moduleIdReallyIsNumber);
    return initializedModule.importedAll = importedAll;
  }
  metroRequire.importAll = metroImportAll;
  metroRequire.context = function fallbackRequireContext() {
    if (__DEV__) {
      throw new Error('The experimental Metro feature `require.context` is not enabled in your project.\nThis can be enabled by setting the `transformer.unstable_allowRequireContext` property to `true` in your Metro configuration.');
    }
    throw new Error('The experimental Metro feature `require.context` is not enabled in your project.');
  };
  metroRequire.resolveWeak = function fallbackRequireResolveWeak() {
    if (__DEV__) {
      throw new Error('require.resolveWeak cannot be called dynamically. Ensure you are using the same version of `metro` and `metro-runtime`.');
    }
    throw new Error('require.resolveWeak cannot be called dynamically.');
  };
  let inGuard = false;
  function guardedLoadModule(moduleId, module) {
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
  function unpackModuleId(moduleId) {
    const segmentId = moduleId >>> ID_MASK_SHIFT;
    const localId = moduleId & LOCAL_ID_MASK;
    return {
      segmentId,
      localId
    };
  }
  metroRequire.unpackModuleId = unpackModuleId;
  function packModuleId(value) {
    return (value.segmentId << ID_MASK_SHIFT) + value.localId;
  }
  metroRequire.packModuleId = packModuleId;
  const moduleDefinersBySegmentID = [];
  const definingSegmentByModuleID = new Map();
  function registerSegment(segmentId, moduleDefiner, moduleIds) {
    moduleDefinersBySegmentID[segmentId] = moduleDefiner;
    if (__DEV__) {
      if (segmentId === 0 && moduleIds) {
        throw new Error('registerSegment: Expected moduleIds to be null for main segment');
      }
      if (segmentId !== 0 && !moduleIds) {
        throw new Error('registerSegment: Expected moduleIds to be passed for segment #' + segmentId);
      }
    }
    if (moduleIds) {
      moduleIds.forEach(moduleId => {
        if (!modules.has(moduleId) && !definingSegmentByModuleID.has(moduleId)) {
          definingSegmentByModuleID.set(moduleId, segmentId);
        }
      });
    }
  }
  function loadModuleImplementation(moduleId, module) {
    if (!module && moduleDefinersBySegmentID.length > 0) {
      const segmentId = definingSegmentByModuleID.get(moduleId) ?? 0;
      const definer = moduleDefinersBySegmentID[segmentId];
      if (definer != null) {
        definer(moduleId);
        module = modules.get(moduleId);
        definingSegmentByModuleID.delete(moduleId);
      }
    }
    const nativeRequire = global.nativeRequire;
    if (!module && nativeRequire) {
      const {
        segmentId,
        localId
      } = unpackModuleId(moduleId);
      nativeRequire(localId, segmentId);
      module = modules.get(moduleId);
    }
    if (!module) {
      throw unknownModuleError(moduleId);
    }
    if (module.hasError) {
      throw module.error;
    }
    if (__DEV__) {
      var Systrace = requireSystrace();
      var Refresh = requireRefresh();
    }
    module.isInitialized = true;
    const {
      factory,
      dependencyMap
    } = module;
    if (__DEV__) {
      initializingModuleIds.push(moduleId);
    }
    try {
      if (__DEV__) {
        Systrace.beginEvent('JS_require_' + (module.verboseName || moduleId));
      }
      const moduleObject = module.publicModule;
      if (__DEV__) {
        moduleObject.hot = module.hot;
        var prevRefreshReg = global.$RefreshReg$;
        var prevRefreshSig = global.$RefreshSig$;
        if (Refresh != null) {
          const RefreshRuntime = Refresh;
          global.$RefreshReg$ = (type, id) => {
            const prefixedModuleId = __METRO_GLOBAL_PREFIX__ + ' ' + moduleId + ' ' + id;
            RefreshRuntime.register(type, prefixedModuleId);
          };
          global.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform;
        }
      }
      moduleObject.id = moduleId;
      factory(global, metroRequire, metroImportDefault, metroImportAll, moduleObject, moduleObject.exports, dependencyMap);
      if (!__DEV__) {
        module.factory = undefined;
        module.dependencyMap = undefined;
      }
      if (__DEV__) {
        Systrace.endEvent();
        if (Refresh != null) {
          const prefixedModuleId = __METRO_GLOBAL_PREFIX__ + ' ' + moduleId;
          registerExportsForReactRefresh(Refresh, moduleObject.exports, prefixedModuleId);
        }
      }
      return moduleObject.exports;
    } catch (e) {
      module.hasError = true;
      module.error = e;
      module.isInitialized = false;
      module.publicModule.exports = undefined;
      throw e;
    } finally {
      if (__DEV__) {
        if (initializingModuleIds.pop() !== moduleId) {
          throw new Error('initializingModuleIds is corrupt; something is terribly wrong');
        }
        global.$RefreshReg$ = prevRefreshReg;
        global.$RefreshSig$ = prevRefreshSig;
      }
    }
  }
  function unknownModuleError(id) {
    let message = 'Requiring unknown module "' + id + '".';
    if (__DEV__) {
      message += ' If you are sure the module exists, try restarting Metro. ' + 'You may also want to run `yarn` or `npm install`.';
    }
    return Error(message);
  }
  if (__DEV__) {
    metroRequire.Systrace = {
      beginEvent: () => {},
      endEvent: () => {}
    };
    metroRequire.getModules = () => {
      return modules;
    };
    var createHotReloadingObject = function () {
      const hot = {
        _acceptCallback: null,
        _disposeCallback: null,
        _didAccept: false,
        accept: callback => {
          hot._didAccept = true;
          hot._acceptCallback = callback;
        },
        dispose: callback => {
          hot._disposeCallback = callback;
        }
      };
      return hot;
    };
    let reactRefreshTimeout = null;
    const metroHotUpdateModule = function (id, factory, dependencyMap, inverseDependencies) {
      const mod = modules.get(id);
      if (!mod) {
        if (factory) {
          return;
        }
        throw unknownModuleError(id);
      }
      if (!mod.hasError && !mod.isInitialized) {
        mod.factory = factory;
        mod.dependencyMap = dependencyMap;
        return;
      }
      const Refresh = requireRefresh();
      const refreshBoundaryIDs = new Set();
      let didBailOut = false;
      let updatedModuleIDs;
      try {
        updatedModuleIDs = topologicalSort([id], pendingID => {
          const pendingModule = modules.get(pendingID);
          if (pendingModule == null) {
            return [];
          }
          const pendingHot = pendingModule.hot;
          if (pendingHot == null) {
            throw new Error('[Refresh] Expected module.hot to always exist in DEV.');
          }
          let canAccept = pendingHot._didAccept;
          if (!canAccept && Refresh != null) {
            const isBoundary = isReactRefreshBoundary(Refresh, pendingModule.publicModule.exports);
            if (isBoundary) {
              canAccept = true;
              refreshBoundaryIDs.add(pendingID);
            }
          }
          if (canAccept) {
            return [];
          }
          const parentIDs = inverseDependencies[pendingID];
          if (parentIDs.length === 0) {
            performFullRefresh('No root boundary', {
              source: mod,
              failed: pendingModule
            });
            didBailOut = true;
            return [];
          }
          return parentIDs;
        }, () => didBailOut).reverse();
      } catch (e) {
        if (e === CYCLE_DETECTED) {
          performFullRefresh('Dependency cycle', {
            source: mod
          });
          return;
        }
        throw e;
      }
      if (didBailOut) {
        return;
      }
      const seenModuleIDs = new Set();
      for (let i = 0; i < updatedModuleIDs.length; i++) {
        const updatedID = updatedModuleIDs[i];
        if (seenModuleIDs.has(updatedID)) {
          continue;
        }
        seenModuleIDs.add(updatedID);
        const updatedMod = modules.get(updatedID);
        if (updatedMod == null) {
          throw new Error('[Refresh] Expected to find the updated module.');
        }
        const prevExports = updatedMod.publicModule.exports;
        const didError = runUpdatedModule(updatedID, updatedID === id ? factory : undefined, updatedID === id ? dependencyMap : undefined);
        const nextExports = updatedMod.publicModule.exports;
        if (didError) {
          return;
        }
        if (refreshBoundaryIDs.has(updatedID)) {
          const isNoLongerABoundary = !isReactRefreshBoundary(Refresh, nextExports);
          const didInvalidate = shouldInvalidateReactRefreshBoundary(Refresh, prevExports, nextExports);
          if (isNoLongerABoundary || didInvalidate) {
            const parentIDs = inverseDependencies[updatedID];
            if (parentIDs.length === 0) {
              performFullRefresh(isNoLongerABoundary ? 'No longer a boundary' : 'Invalidated boundary', {
                source: mod,
                failed: updatedMod
              });
              return;
            }
            for (let j = 0; j < parentIDs.length; j++) {
              const parentID = parentIDs[j];
              const parentMod = modules.get(parentID);
              if (parentMod == null) {
                throw new Error('[Refresh] Expected to find parent module.');
              }
              const canAcceptParent = isReactRefreshBoundary(Refresh, parentMod.publicModule.exports);
              if (canAcceptParent) {
                refreshBoundaryIDs.add(parentID);
                updatedModuleIDs.push(parentID);
              } else {
                performFullRefresh('Invalidated boundary', {
                  source: mod,
                  failed: parentMod
                });
                return;
              }
            }
          }
        }
      }
      if (Refresh != null) {
        if (reactRefreshTimeout == null) {
          reactRefreshTimeout = setTimeout(() => {
            reactRefreshTimeout = null;
            Refresh.performReactRefresh();
          }, 30);
        }
      }
    };
    const topologicalSort = function (roots, getEdges, earlyStop) {
      const result = [];
      const visited = new Set();
      const stack = new Set();
      function traverseDependentNodes(node) {
        if (stack.has(node)) {
          throw CYCLE_DETECTED;
        }
        if (visited.has(node)) {
          return;
        }
        visited.add(node);
        stack.add(node);
        const dependentNodes = getEdges(node);
        if (earlyStop(node)) {
          stack.delete(node);
          return;
        }
        dependentNodes.forEach(dependent => {
          traverseDependentNodes(dependent);
        });
        stack.delete(node);
        result.push(node);
      }
      roots.forEach(root => {
        traverseDependentNodes(root);
      });
      return result;
    };
    const runUpdatedModule = function (id, factory, dependencyMap) {
      const mod = modules.get(id);
      if (mod == null) {
        throw new Error('[Refresh] Expected to find the module.');
      }
      const {
        hot
      } = mod;
      if (!hot) {
        throw new Error('[Refresh] Expected module.hot to always exist in DEV.');
      }
      if (hot._disposeCallback) {
        try {
          hot._disposeCallback();
        } catch (error) {
          console.error(`Error while calling dispose handler for module ${id}: `, error);
        }
      }
      if (factory) {
        mod.factory = factory;
      }
      if (dependencyMap) {
        mod.dependencyMap = dependencyMap;
      }
      mod.hasError = false;
      mod.error = undefined;
      mod.importedAll = EMPTY;
      mod.importedDefault = EMPTY;
      mod.isInitialized = false;
      const prevExports = mod.publicModule.exports;
      mod.publicModule.exports = {};
      hot._didAccept = false;
      hot._acceptCallback = null;
      hot._disposeCallback = null;
      metroRequire(id);
      if (mod.hasError) {
        mod.hasError = false;
        mod.isInitialized = true;
        mod.error = null;
        mod.publicModule.exports = prevExports;
        return true;
      }
      if (hot._acceptCallback) {
        try {
          hot._acceptCallback();
        } catch (error) {
          console.error(`Error while calling accept handler for module ${id}: `, error);
        }
      }
      return false;
    };
    const performFullRefresh = (reason, modules) => {
      if (typeof window !== 'undefined' && window.location != null && typeof window.location.reload === 'function') {
        window.location.reload();
      } else {
        const Refresh = requireRefresh();
        if (Refresh != null) {
          const sourceName = modules.source?.verboseName ?? 'unknown';
          const failedName = modules.failed?.verboseName ?? 'unknown';
          Refresh.performFullRefresh(`Fast Refresh - ${reason} <${sourceName}> <${failedName}>`);
        } else {
          console.warn('Could not reload the application after an edit.');
        }
      }
    };
    const isExportSafeToAccess = (moduleExports, key) => {
      return moduleExports?.__esModule || Object.getOwnPropertyDescriptor(moduleExports, key)?.get == null;
    };
    var isReactRefreshBoundary = function (Refresh, moduleExports) {
      if (Refresh.isLikelyComponentType(moduleExports)) {
        return true;
      }
      if (moduleExports == null || typeof moduleExports !== 'object') {
        return false;
      }
      let hasExports = false;
      let areAllExportsComponents = true;
      for (const key in moduleExports) {
        hasExports = true;
        if (key === '__esModule') {
          continue;
        } else if (!isExportSafeToAccess(moduleExports, key)) {
          return false;
        }
        const exportValue = moduleExports[key];
        if (!Refresh.isLikelyComponentType(exportValue)) {
          areAllExportsComponents = false;
        }
      }
      return hasExports && areAllExportsComponents;
    };
    var shouldInvalidateReactRefreshBoundary = (Refresh, prevExports, nextExports) => {
      const prevSignature = getRefreshBoundarySignature(Refresh, prevExports);
      const nextSignature = getRefreshBoundarySignature(Refresh, nextExports);
      if (prevSignature.length !== nextSignature.length) {
        return true;
      }
      for (let i = 0; i < nextSignature.length; i++) {
        if (prevSignature[i] !== nextSignature[i]) {
          return true;
        }
      }
      return false;
    };
    var getRefreshBoundarySignature = (Refresh, moduleExports) => {
      const signature = [];
      signature.push(Refresh.getFamilyByType(moduleExports));
      if (moduleExports == null || typeof moduleExports !== 'object') {
        return signature;
      }
      for (const key in moduleExports) {
        if (key === '__esModule') {
          continue;
        } else if (!isExportSafeToAccess(moduleExports, key)) {
          continue;
        }
        const exportValue = moduleExports[key];
        signature.push(key);
        signature.push(Refresh.getFamilyByType(exportValue));
      }
      return signature;
    };
    var registerExportsForReactRefresh = (Refresh, moduleExports, moduleID) => {
      Refresh.register(moduleExports, moduleID + ' %exports%');
      if (moduleExports == null || typeof moduleExports !== 'object') {
        return;
      }
      for (const key in moduleExports) {
        if (!isExportSafeToAccess(moduleExports, key)) {
          continue;
        }
        const exportValue = moduleExports[key];
        const typeID = moduleID + ' %exports% ' + key;
        Refresh.register(exportValue, typeID);
      }
    };
    global.__accept = metroHotUpdateModule;
  }
  if (__DEV__) {
    var requireSystrace = function requireSystrace() {
      return global[__METRO_GLOBAL_PREFIX__ + '__SYSTRACE'] || metroRequire.Systrace;
    };
    var requireRefresh = function requireRefresh() {
      return global[__METRO_GLOBAL_PREFIX__ + '__ReactRefresh'] || global[global.__METRO_GLOBAL_PREFIX__ + '__ReactRefresh'] || metroRequire.Refresh;
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : this);
__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  const foo = _$$_REQUIRE(_dependencyMap[0], "react-native-worklets/__generatedWorklets/1744845278195.js").default({});
  foo();
},0,[1],"file.js");
__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.default = void 0;
  var foo_fileJs3Factory = exports.default = function foo_fileJs3Factory({}) {
    const _e = [new global.Error(), 1, -27];
    const foo = function () {
      const bar = _$$_REQUIRE(_dependencyMap[0], "react-native-worklets/__generatedWorklets/4637680764745.js").default({});
      return bar() + 1;
    };
    foo.__closure = {};
    foo.__workletHash = 1744845278195;
    foo.__pluginVersion = "0.6.0";
    foo.__stackDetails = _e;
    return foo;
  };
},1,[2],"node_modules/react-native-worklets/__generatedWorklets/1744845278195.js");
__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.default = void 0;
  var bar_fileJs2Factory = exports.default = function bar_fileJs2Factory({}) {
    const _e = [new global.Error(), 1, -27];
    const bar = function () {
      const baz = _$$_REQUIRE(_dependencyMap[0], "react-native-worklets/__generatedWorklets/4239799135658.js").default({});
      return baz() + 1;
    };
    bar.__closure = {};
    bar.__workletHash = 4637680764745;
    bar.__pluginVersion = "0.6.0";
    bar.__stackDetails = _e;
    return bar;
  };
},2,[3],"node_modules/react-native-worklets/__generatedWorklets/4637680764745.js");
__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.default = void 0;
  var baz_fileJs1Factory = exports.default = function baz_fileJs1Factory({}) {
    const _e = [new global.Error(), 1, -27];
    const baz = function () {
      return 1;
    };
    baz.__closure = {};
    baz.__workletHash = 4239799135658;
    baz.__pluginVersion = "0.6.0";
    baz.__stackDetails = _e;
    return baz;
  };
},3,[],"node_modules/react-native-worklets/__generatedWorklets/4239799135658.js");
__r(0);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIl9fcHJlbHVkZV9fIiwiL1VzZXJzL2JpZ3BvcHBlL3N3bWFuc2lvbi9tZXRyby9wYWNrYWdlcy9tZXRyby1ydW50aW1lL3NyYy9wb2x5ZmlsbHMvcmVxdWlyZS5qcyIsIi9Vc2Vycy9iaWdwb3BwZS9zd21hbnNpb24vbWV0cm8vZmlsZS5qcyIsIi9Vc2Vycy9iaWdwb3BwZS9zd21hbnNpb24vbWV0cm8vbm9kZV9tb2R1bGVzL3JlYWN0LW5hdGl2ZS13b3JrbGV0cy9fX2dlbmVyYXRlZFdvcmtsZXRzLzE3NDQ4NDUyNzgxOTUuanMiLCIvVXNlcnMvYmlncG9wcGUvc3dtYW5zaW9uL21ldHJvL25vZGVfbW9kdWxlcy9yZWFjdC1uYXRpdmUtd29ya2xldHMvX19nZW5lcmF0ZWRXb3JrbGV0cy80NjM3NjgwNzY0NzQ1LmpzIiwiL1VzZXJzL2JpZ3BvcHBlL3N3bWFuc2lvbi9tZXRyby9ub2RlX21vZHVsZXMvcmVhY3QtbmF0aXZlLXdvcmtsZXRzL19fZ2VuZXJhdGVkV29ya2xldHMvNDIzOTc5OTEzNTY1OC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJ2YXIgX19CVU5ETEVfU1RBUlRfVElNRV9fPWdsb2JhbFRoaXMubmF0aXZlUGVyZm9ybWFuY2VOb3c/bmF0aXZlUGVyZm9ybWFuY2VOb3coKTpEYXRlLm5vdygpLF9fREVWX189dHJ1ZSxwcm9jZXNzPWdsb2JhbFRoaXMucHJvY2Vzc3x8e30sX19NRVRST19HTE9CQUxfUFJFRklYX189JycsX19yZXF1aXJlQ3ljbGVJZ25vcmVQYXR0ZXJucz1bLyhefFxcL3xcXFxcKW5vZGVfbW9kdWxlcygkfFxcL3xcXFxcKS9dO3Byb2Nlc3MuZW52PXByb2Nlc3MuZW52fHx7fTtwcm9jZXNzLmVudi5OT0RFX0VOVj1wcm9jZXNzLmVudi5OT0RFX0VOVnx8XCJkZXZlbG9wbWVudFwiOyIsIi8qKlxuICogQ29weXJpZ2h0IChjKSBNZXRhIFBsYXRmb3JtcywgSW5jLiBhbmQgYWZmaWxpYXRlcy5cbiAqXG4gKiBUaGlzIHNvdXJjZSBjb2RlIGlzIGxpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgbGljZW5zZSBmb3VuZCBpbiB0aGVcbiAqIExJQ0VOU0UgZmlsZSBpbiB0aGUgcm9vdCBkaXJlY3Rvcnkgb2YgdGhpcyBzb3VyY2UgdHJlZS5cbiAqXG4gKiBAZmxvd1xuICogQGZvcm1hdFxuICogQG9uY2FsbCByZWFjdF9uYXRpdmVcbiAqIEBwb2x5ZmlsbFxuICovXG5cbid1c2Ugc3RyaWN0JztcblxuLyogZXNsaW50LWRpc2FibGUgbm8tYml0d2lzZSAqL1xuXG5kZWNsYXJlIHZhciBfX0RFVl9fOiBib29sZWFuO1xuZGVjbGFyZSB2YXIgX19NRVRST19HTE9CQUxfUFJFRklYX186IHN0cmluZztcblxuLy8gQSBzaW1wbGVyICRBcnJheUxpa2U8VD4uIE5vdCBpdGVyYWJsZSBhbmQgZG9lc24ndCBoYXZlIGEgYGxlbmd0aGAuXG4vLyBUaGlzIGlzIGNvbXBhdGlibGUgd2l0aCBhY3R1YWwgYXJyYXlzIGFzIHdlbGwgYXMgd2l0aCBvYmplY3RzIHRoYXQgbG9vayBsaWtlXG4vLyB7MDogJ3ZhbHVlJywgMTogJy4uLid9XG50eXBlIEFycmF5SW5kZXhhYmxlPFQ+ID0gaW50ZXJmYWNlIHtcbiAgK1tpbmRleGVyOiBudW1iZXJdOiBULFxufTtcbnR5cGUgRGVwZW5kZW5jeU1hcCA9ICRSZWFkT25seTxcbiAgQXJyYXlJbmRleGFibGU8TW9kdWxlSUQ+ICYge1xuICAgIHBhdGhzPzoge1tpZDogTW9kdWxlSURdOiBzdHJpbmd9LFxuICB9LFxuPjtcbnR5cGUgSW52ZXJzZURlcGVuZGVuY3lNYXAgPSB7W2tleTogTW9kdWxlSURdOiBBcnJheTxNb2R1bGVJRD4sIC4uLn07XG50eXBlIEV4cG9ydHMgPSBhbnk7XG50eXBlIEZhY3RvcnlGbiA9IChcbiAgZ2xvYmFsOiBPYmplY3QsXG4gIHJlcXVpcmU6IFJlcXVpcmVGbixcbiAgbWV0cm9JbXBvcnREZWZhdWx0OiBSZXF1aXJlRm4sXG4gIG1ldHJvSW1wb3J0QWxsOiBSZXF1aXJlRm4sXG4gIG1vZHVsZU9iamVjdDoge2V4cG9ydHM6IHsuLi59LCAuLi59LFxuICBleHBvcnRzOiB7Li4ufSxcbiAgZGVwZW5kZW5jeU1hcDogP0RlcGVuZGVuY3lNYXAsXG4pID0+IHZvaWQ7XG50eXBlIEhvdE1vZHVsZVJlbG9hZGluZ0NhbGxiYWNrID0gKCkgPT4gdm9pZDtcbnR5cGUgSG90TW9kdWxlUmVsb2FkaW5nRGF0YSA9IHtcbiAgX2FjY2VwdENhbGxiYWNrOiA/SG90TW9kdWxlUmVsb2FkaW5nQ2FsbGJhY2ssXG4gIF9kaXNwb3NlQ2FsbGJhY2s6ID9Ib3RNb2R1bGVSZWxvYWRpbmdDYWxsYmFjayxcbiAgX2RpZEFjY2VwdDogYm9vbGVhbixcbiAgYWNjZXB0OiAoY2FsbGJhY2s/OiBIb3RNb2R1bGVSZWxvYWRpbmdDYWxsYmFjaykgPT4gdm9pZCxcbiAgZGlzcG9zZTogKGNhbGxiYWNrPzogSG90TW9kdWxlUmVsb2FkaW5nQ2FsbGJhY2spID0+IHZvaWQsXG59O1xudHlwZSBNb2R1bGVJRCA9IG51bWJlcjtcbnR5cGUgTW9kdWxlID0ge1xuICBpZD86IE1vZHVsZUlELFxuICBleHBvcnRzOiBFeHBvcnRzLFxuICBob3Q/OiBIb3RNb2R1bGVSZWxvYWRpbmdEYXRhLFxuICAuLi5cbn07XG50eXBlIE1vZHVsZURlZmluaXRpb24gPSB7XG4gIGRlcGVuZGVuY3lNYXA6ID9EZXBlbmRlbmN5TWFwLFxuICBlcnJvcj86IGFueSxcbiAgZmFjdG9yeTogRmFjdG9yeUZuLFxuICBoYXNFcnJvcjogYm9vbGVhbixcbiAgaG90PzogSG90TW9kdWxlUmVsb2FkaW5nRGF0YSxcbiAgaW1wb3J0ZWRBbGw6IGFueSxcbiAgaW1wb3J0ZWREZWZhdWx0OiBhbnksXG4gIGlzSW5pdGlhbGl6ZWQ6IGJvb2xlYW4sXG4gIHBhdGg/OiBzdHJpbmcsXG4gIHB1YmxpY01vZHVsZTogTW9kdWxlLFxuICB2ZXJib3NlTmFtZT86IHN0cmluZyxcbn07XG50eXBlIE1vZHVsZUxpc3QgPSBNYXA8bnVtYmVyLCBNb2R1bGVEZWZpbml0aW9uPjtcbmV4cG9ydCB0eXBlIFJlcXVpcmVGbiA9IChpZDogTW9kdWxlSUQgfCBWZXJib3NlTW9kdWxlTmFtZUZvckRldikgPT4gRXhwb3J0cztcbmV4cG9ydCB0eXBlIERlZmluZUZuID0gKFxuICBmYWN0b3J5OiBGYWN0b3J5Rm4sXG4gIG1vZHVsZUlkOiBudW1iZXIsXG4gIGRlcGVuZGVuY3lNYXA/OiBEZXBlbmRlbmN5TWFwLFxuICB2ZXJib3NlTmFtZT86IHN0cmluZyxcbiAgaW52ZXJzZURlcGVuZGVuY2llcz86IEludmVyc2VEZXBlbmRlbmN5TWFwLFxuKSA9PiB2b2lkO1xuXG50eXBlIFZlcmJvc2VNb2R1bGVOYW1lRm9yRGV2ID0gc3RyaW5nO1xudHlwZSBNb2R1bGVEZWZpbmVyID0gKG1vZHVsZUlkOiBNb2R1bGVJRCkgPT4gdm9pZDtcblxuZ2xvYmFsLl9fciA9IG1ldHJvUmVxdWlyZSBhcyBSZXF1aXJlRm47XG5nbG9iYWxbYCR7X19NRVRST19HTE9CQUxfUFJFRklYX199X19kYF0gPSBkZWZpbmUgYXMgRGVmaW5lRm47XG5nbG9iYWwuX19jID0gY2xlYXI7XG5nbG9iYWwuX19yZWdpc3RlclNlZ21lbnQgPSByZWdpc3RlclNlZ21lbnQ7XG5cbnZhciBtb2R1bGVzID0gY2xlYXIoKTtcblxuLy8gRG9uJ3QgdXNlIGEgU3ltYm9sIGhlcmUsIGl0IHdvdWxkIHB1bGwgaW4gYW4gZXh0cmEgcG9seWZpbGwgd2l0aCBhbGwgc29ydHMgb2Zcbi8vIGFkZGl0aW9uYWwgc3R1ZmYgKGUuZy4gQXJyYXkuZnJvbSkuXG5jb25zdCBFTVBUWSA9IHt9O1xuY29uc3QgQ1lDTEVfREVURUNURUQgPSB7fTtcbmNvbnN0IHtoYXNPd25Qcm9wZXJ0eX0gPSB7fTtcblxuaWYgKF9fREVWX18pIHtcbiAgZ2xvYmFsLiRSZWZyZXNoUmVnJCA9IGdsb2JhbC4kUmVmcmVzaFJlZyQgPz8gKCgpID0+IHt9KTtcbiAgZ2xvYmFsLiRSZWZyZXNoU2lnJCA9IGdsb2JhbC4kUmVmcmVzaFNpZyQgPz8gKCgpID0+IHR5cGUgPT4gdHlwZSk7XG59XG5cbmZ1bmN0aW9uIGNsZWFyKCk6IE1vZHVsZUxpc3Qge1xuICBtb2R1bGVzID0gbmV3IE1hcCgpO1xuXG4gIC8vIFdlIHJldHVybiBtb2R1bGVzIGhlcmUgc28gdGhhdCB3ZSBjYW4gYXNzaWduIGFuIGluaXRpYWwgdmFsdWUgdG8gbW9kdWxlc1xuICAvLyB3aGVuIGRlZmluaW5nIGl0LiBPdGhlcndpc2UsIHdlIHdvdWxkIGhhdmUgdG8gZG8gXCJsZXQgbW9kdWxlcyA9IG51bGxcIixcbiAgLy8gd2hpY2ggd2lsbCBmb3JjZSB1cyB0byBhZGQgXCJudWxsdGhyb3dzXCIgZXZlcnl3aGVyZS5cbiAgcmV0dXJuIG1vZHVsZXM7XG59XG5cbmlmIChfX0RFVl9fKSB7XG4gIHZhciB2ZXJib3NlTmFtZXNUb01vZHVsZUlkczogTWFwPHN0cmluZywgbnVtYmVyPiA9IG5ldyBNYXAoKTtcbiAgdmFyIGdldE1vZHVsZUlkRm9yVmVyYm9zZU5hbWUgPSAodmVyYm9zZU5hbWU6IHN0cmluZyk6IG51bWJlciA9PiB7XG4gICAgY29uc3QgbW9kdWxlSWQgPSB2ZXJib3NlTmFtZXNUb01vZHVsZUlkcy5nZXQodmVyYm9zZU5hbWUpO1xuICAgIGlmIChtb2R1bGVJZCA9PSBudWxsKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gbmFtZWQgbW9kdWxlOiBcIiR7dmVyYm9zZU5hbWV9XCJgKTtcbiAgICB9XG4gICAgcmV0dXJuIG1vZHVsZUlkO1xuICB9O1xuICB2YXIgaW5pdGlhbGl6aW5nTW9kdWxlSWRzOiBBcnJheTxudW1iZXI+ID0gW107XG59XG5cbmZ1bmN0aW9uIGRlZmluZShcbiAgZmFjdG9yeTogRmFjdG9yeUZuLFxuICBtb2R1bGVJZDogbnVtYmVyLFxuICBkZXBlbmRlbmN5TWFwPzogRGVwZW5kZW5jeU1hcCxcbik6IHZvaWQge1xuICBpZiAobW9kdWxlcy5oYXMobW9kdWxlSWQpKSB7XG4gICAgaWYgKF9fREVWX18pIHtcbiAgICAgIC8vIChXZSB0YWtlIGBpbnZlcnNlRGVwZW5kZW5jaWVzYCBmcm9tIGBhcmd1bWVudHNgIHRvIGF2b2lkIGFuIHVudXNlZFxuICAgICAgLy8gbmFtZWQgcGFyYW1ldGVyIGluIGBkZWZpbmVgIGluIHByb2R1Y3Rpb24uXG4gICAgICBjb25zdCBpbnZlcnNlRGVwZW5kZW5jaWVzID0gYXJndW1lbnRzWzRdO1xuXG4gICAgICAvLyBJZiB0aGUgbW9kdWxlIGhhcyBhbHJlYWR5IGJlZW4gZGVmaW5lZCBhbmQgdGhlIGRlZmluZSBtZXRob2QgaGFzIGJlZW5cbiAgICAgIC8vIGNhbGxlZCB3aXRoIGludmVyc2VEZXBlbmRlbmNpZXMsIHdlIGNhbiBob3QgcmVsb2FkIGl0LlxuICAgICAgaWYgKGludmVyc2VEZXBlbmRlbmNpZXMpIHtcbiAgICAgICAgZ2xvYmFsLl9fYWNjZXB0KG1vZHVsZUlkLCBmYWN0b3J5LCBkZXBlbmRlbmN5TWFwLCBpbnZlcnNlRGVwZW5kZW5jaWVzKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBwcmV2ZW50IHJlcGVhdGVkIGNhbGxzIHRvIGBnbG9iYWwubmF0aXZlUmVxdWlyZWAgdG8gb3ZlcndyaXRlIG1vZHVsZXNcbiAgICAvLyB0aGF0IGFyZSBhbHJlYWR5IGxvYWRlZFxuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IG1vZDogTW9kdWxlRGVmaW5pdGlvbiA9IHtcbiAgICBkZXBlbmRlbmN5TWFwLFxuICAgIGZhY3RvcnksXG4gICAgaGFzRXJyb3I6IGZhbHNlLFxuICAgIGltcG9ydGVkQWxsOiBFTVBUWSxcbiAgICBpbXBvcnRlZERlZmF1bHQ6IEVNUFRZLFxuICAgIGlzSW5pdGlhbGl6ZWQ6IGZhbHNlLFxuICAgIHB1YmxpY01vZHVsZToge2V4cG9ydHM6IHt9fSxcbiAgfTtcblxuICBtb2R1bGVzLnNldChtb2R1bGVJZCwgbW9kKTtcblxuICBpZiAoX19ERVZfXykge1xuICAgIC8vIEhNUlxuICAgIG1vZC5ob3QgPSBjcmVhdGVIb3RSZWxvYWRpbmdPYmplY3QoKTtcblxuICAgIC8vIERFQlVHR0FCTEUgTU9EVUxFUyBOQU1FU1xuICAgIC8vIHdlIHRha2UgYHZlcmJvc2VOYW1lYCBmcm9tIGBhcmd1bWVudHNgIHRvIGF2b2lkIGFuIHVudXNlZCBuYW1lZCBwYXJhbWV0ZXJcbiAgICAvLyBpbiBgZGVmaW5lYCBpbiBwcm9kdWN0aW9uLlxuICAgIGNvbnN0IHZlcmJvc2VOYW1lOiBzdHJpbmcgfCB2b2lkID0gYXJndW1lbnRzWzNdO1xuICAgIGlmICh2ZXJib3NlTmFtZSkge1xuICAgICAgbW9kLnZlcmJvc2VOYW1lID0gdmVyYm9zZU5hbWU7XG4gICAgICB2ZXJib3NlTmFtZXNUb01vZHVsZUlkcy5zZXQodmVyYm9zZU5hbWUsIG1vZHVsZUlkKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gbWV0cm9SZXF1aXJlKFxuICBtb2R1bGVJZDogTW9kdWxlSUQgfCBWZXJib3NlTW9kdWxlTmFtZUZvckRldiB8IG51bGwsXG4gIG1heWJlTmFtZUZvckRldj86IHN0cmluZyxcbik6IEV4cG9ydHMge1xuICAvLyBVbnJlc29sdmVkIG9wdGlvbmFsIGRlcGVuZGVuY2llcyBhcmUgbnVsbHMgaW4gZGVwZW5kZW5jeSBtYXBzXG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsaW50L3N0cmljdGx5LW51bGxcbiAgaWYgKG1vZHVsZUlkID09PSBudWxsKSB7XG4gICAgaWYgKF9fREVWX18gJiYgdHlwZW9mIG1heWJlTmFtZUZvckRldiA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIgKyBtYXliZU5hbWVGb3JEZXYgKyBcIidcIik7XG4gICAgfVxuICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IGZpbmQgbW9kdWxlJyk7XG4gIH1cblxuICBpZiAoX19ERVZfXyAmJiB0eXBlb2YgbW9kdWxlSWQgPT09ICdzdHJpbmcnKSB7XG4gICAgY29uc3QgdmVyYm9zZU5hbWUgPSBtb2R1bGVJZDtcbiAgICBtb2R1bGVJZCA9IGdldE1vZHVsZUlkRm9yVmVyYm9zZU5hbWUodmVyYm9zZU5hbWUpO1xuICAgIGNvbnNvbGUud2FybihcbiAgICAgIGBSZXF1aXJpbmcgbW9kdWxlIFwiJHt2ZXJib3NlTmFtZX1cIiBieSBuYW1lIGlzIG9ubHkgc3VwcG9ydGVkIGZvciBgICtcbiAgICAgICAgJ2RlYnVnZ2luZyBwdXJwb3NlcyBhbmQgd2lsbCBCUkVBSyBJTiBQUk9EVUNUSU9OIScsXG4gICAgKTtcbiAgfVxuXG4gIC8vJEZsb3dGaXhNZVtpbmNvbXBhdGlibGUtdHlwZV06IGF0IHRoaXMgcG9pbnQgd2Uga25vdyB0aGF0IG1vZHVsZUlkIGlzIGEgbnVtYmVyXG4gIGNvbnN0IG1vZHVsZUlkUmVhbGx5SXNOdW1iZXI6IG51bWJlciA9IG1vZHVsZUlkO1xuXG4gIGlmIChfX0RFVl9fKSB7XG4gICAgY29uc3QgaW5pdGlhbGl6aW5nSW5kZXggPSBpbml0aWFsaXppbmdNb2R1bGVJZHMuaW5kZXhPZihcbiAgICAgIG1vZHVsZUlkUmVhbGx5SXNOdW1iZXIsXG4gICAgKTtcbiAgICBpZiAoaW5pdGlhbGl6aW5nSW5kZXggIT09IC0xKSB7XG4gICAgICBjb25zdCBjeWNsZSA9IGluaXRpYWxpemluZ01vZHVsZUlkc1xuICAgICAgICAuc2xpY2UoaW5pdGlhbGl6aW5nSW5kZXgpXG4gICAgICAgIC5tYXAoKGlkOiBudW1iZXIpID0+IG1vZHVsZXMuZ2V0KGlkKT8udmVyYm9zZU5hbWUgPz8gJ1t1bmtub3duXScpO1xuICAgICAgaWYgKHNob3VsZFByaW50UmVxdWlyZUN5Y2xlKGN5Y2xlKSkge1xuICAgICAgICBjeWNsZS5wdXNoKGN5Y2xlWzBdKTsgLy8gV2Ugd2FudCB0byBwcmludCBBIC0+IEIgLT4gQTpcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBSZXF1aXJlIGN5Y2xlOiAke2N5Y2xlLmpvaW4oJyAtPiAnKX1cXG5cXG5gICtcbiAgICAgICAgICAgICdSZXF1aXJlIGN5Y2xlcyBhcmUgYWxsb3dlZCwgYnV0IGNhbiByZXN1bHQgaW4gdW5pbml0aWFsaXplZCB2YWx1ZXMuICcgK1xuICAgICAgICAgICAgJ0NvbnNpZGVyIHJlZmFjdG9yaW5nIHRvIHJlbW92ZSB0aGUgbmVlZCBmb3IgYSBjeWNsZS4nLFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IG1vZHVsZSA9IG1vZHVsZXMuZ2V0KG1vZHVsZUlkUmVhbGx5SXNOdW1iZXIpO1xuXG4gIHJldHVybiBtb2R1bGUgJiYgbW9kdWxlLmlzSW5pdGlhbGl6ZWRcbiAgICA/IG1vZHVsZS5wdWJsaWNNb2R1bGUuZXhwb3J0c1xuICAgIDogZ3VhcmRlZExvYWRNb2R1bGUobW9kdWxlSWRSZWFsbHlJc051bWJlciwgbW9kdWxlKTtcbn1cblxuLy8gV2UgcHJpbnQgcmVxdWlyZSBjeWNsZXMgdW5sZXNzIHRoZXkgbWF0Y2ggYSBwYXR0ZXJuIGluIHRoZVxuLy8gYHJlcXVpcmVDeWNsZUlnbm9yZVBhdHRlcm5zYCBjb25maWd1cmF0aW9uLlxuZnVuY3Rpb24gc2hvdWxkUHJpbnRSZXF1aXJlQ3ljbGUobW9kdWxlczogJFJlYWRPbmx5QXJyYXk8P3N0cmluZz4pOiBib29sZWFuIHtcbiAgY29uc3QgcmVnRXhwcyA9XG4gICAgZ2xvYmFsW19fTUVUUk9fR0xPQkFMX1BSRUZJWF9fICsgJ19fcmVxdWlyZUN5Y2xlSWdub3JlUGF0dGVybnMnXTtcbiAgaWYgKCFBcnJheS5pc0FycmF5KHJlZ0V4cHMpKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBjb25zdCBpc0lnbm9yZWQgPSAobW9kdWxlOiA/c3RyaW5nKSA9PlxuICAgIG1vZHVsZSAhPSBudWxsICYmIHJlZ0V4cHMuc29tZShyZWdFeHAgPT4gcmVnRXhwLnRlc3QobW9kdWxlKSk7XG5cbiAgLy8gUHJpbnQgdGhlIGN5Y2xlIHVubGVzcyBhbnkgcGFydCBvZiBpdCBpcyBpZ25vcmVkXG4gIHJldHVybiBtb2R1bGVzLmV2ZXJ5KG1vZHVsZSA9PiAhaXNJZ25vcmVkKG1vZHVsZSkpO1xufVxuXG5mdW5jdGlvbiBtZXRyb0ltcG9ydERlZmF1bHQoXG4gIG1vZHVsZUlkOiBNb2R1bGVJRCB8IFZlcmJvc2VNb2R1bGVOYW1lRm9yRGV2LFxuKTogYW55IHwgRXhwb3J0cyB7XG4gIGlmIChfX0RFVl9fICYmIHR5cGVvZiBtb2R1bGVJZCA9PT0gJ3N0cmluZycpIHtcbiAgICBjb25zdCB2ZXJib3NlTmFtZSA9IG1vZHVsZUlkO1xuICAgIG1vZHVsZUlkID0gZ2V0TW9kdWxlSWRGb3JWZXJib3NlTmFtZSh2ZXJib3NlTmFtZSk7XG4gIH1cblxuICAvLyRGbG93Rml4TWVbaW5jb21wYXRpYmxlLXR5cGVdOiBhdCB0aGlzIHBvaW50IHdlIGtub3cgdGhhdCBtb2R1bGVJZCBpcyBhIG51bWJlclxuICBjb25zdCBtb2R1bGVJZFJlYWxseUlzTnVtYmVyOiBudW1iZXIgPSBtb2R1bGVJZDtcblxuICBjb25zdCBtYXliZUluaXRpYWxpemVkTW9kdWxlID0gbW9kdWxlcy5nZXQobW9kdWxlSWRSZWFsbHlJc051bWJlcik7XG5cbiAgaWYgKFxuICAgIG1heWJlSW5pdGlhbGl6ZWRNb2R1bGUgJiZcbiAgICBtYXliZUluaXRpYWxpemVkTW9kdWxlLmltcG9ydGVkRGVmYXVsdCAhPT0gRU1QVFlcbiAgKSB7XG4gICAgcmV0dXJuIG1heWJlSW5pdGlhbGl6ZWRNb2R1bGUuaW1wb3J0ZWREZWZhdWx0O1xuICB9XG5cbiAgY29uc3QgZXhwb3J0czogRXhwb3J0cyA9IG1ldHJvUmVxdWlyZShtb2R1bGVJZFJlYWxseUlzTnVtYmVyKTtcbiAgY29uc3QgaW1wb3J0ZWREZWZhdWx0OiBhbnkgfCBFeHBvcnRzID1cbiAgICBleHBvcnRzICYmIGV4cG9ydHMuX19lc01vZHVsZSA/IGV4cG9ydHMuZGVmYXVsdCA6IGV4cG9ydHM7XG5cbiAgLy8gJEZsb3dGaXhNZVtpbmNvbXBhdGlibGUtdHlwZV0gVGhlIGBtZXRyb1JlcXVpcmVgIGNhbGwgYWJvdmUgd291bGQgaGF2ZSB0aHJvd24gaWYgbW9kdWxlc1tpZF0gd2FzIG51bGxcbiAgY29uc3QgaW5pdGlhbGl6ZWRNb2R1bGU6IE1vZHVsZURlZmluaXRpb24gPSBtb2R1bGVzLmdldChcbiAgICBtb2R1bGVJZFJlYWxseUlzTnVtYmVyLFxuICApO1xuICByZXR1cm4gKGluaXRpYWxpemVkTW9kdWxlLmltcG9ydGVkRGVmYXVsdCA9IGltcG9ydGVkRGVmYXVsdCk7XG59XG5tZXRyb1JlcXVpcmUuaW1wb3J0RGVmYXVsdCA9IG1ldHJvSW1wb3J0RGVmYXVsdDtcblxuZnVuY3Rpb24gbWV0cm9JbXBvcnRBbGwoXG4gIG1vZHVsZUlkOiBNb2R1bGVJRCB8IFZlcmJvc2VNb2R1bGVOYW1lRm9yRGV2IHwgbnVtYmVyLFxuKTogYW55IHwgRXhwb3J0cyB8IHtbc3RyaW5nXTogYW55fSB7XG4gIGlmIChfX0RFVl9fICYmIHR5cGVvZiBtb2R1bGVJZCA9PT0gJ3N0cmluZycpIHtcbiAgICBjb25zdCB2ZXJib3NlTmFtZSA9IG1vZHVsZUlkO1xuICAgIG1vZHVsZUlkID0gZ2V0TW9kdWxlSWRGb3JWZXJib3NlTmFtZSh2ZXJib3NlTmFtZSk7XG4gIH1cblxuICAvLyRGbG93Rml4TWVbaW5jb21wYXRpYmxlLXR5cGVdOiBhdCB0aGlzIHBvaW50IHdlIGtub3cgdGhhdCBtb2R1bGVJZCBpcyBhIG51bWJlclxuICBjb25zdCBtb2R1bGVJZFJlYWxseUlzTnVtYmVyOiBudW1iZXIgPSBtb2R1bGVJZDtcblxuICBjb25zdCBtYXliZUluaXRpYWxpemVkTW9kdWxlID0gbW9kdWxlcy5nZXQobW9kdWxlSWRSZWFsbHlJc051bWJlcik7XG5cbiAgaWYgKG1heWJlSW5pdGlhbGl6ZWRNb2R1bGUgJiYgbWF5YmVJbml0aWFsaXplZE1vZHVsZS5pbXBvcnRlZEFsbCAhPT0gRU1QVFkpIHtcbiAgICByZXR1cm4gbWF5YmVJbml0aWFsaXplZE1vZHVsZS5pbXBvcnRlZEFsbDtcbiAgfVxuXG4gIGNvbnN0IGV4cG9ydHM6IEV4cG9ydHMgPSBtZXRyb1JlcXVpcmUobW9kdWxlSWRSZWFsbHlJc051bWJlcik7XG4gIGxldCBpbXBvcnRlZEFsbDogRXhwb3J0cyB8IHtbc3RyaW5nXTogYW55fTtcblxuICBpZiAoZXhwb3J0cyAmJiBleHBvcnRzLl9fZXNNb2R1bGUpIHtcbiAgICBpbXBvcnRlZEFsbCA9IGV4cG9ydHM7XG4gIH0gZWxzZSB7XG4gICAgaW1wb3J0ZWRBbGwgPSB7fSBhcyB7W3N0cmluZ106IGFueX07XG5cbiAgICAvLyBSZWZyYWluIGZyb20gdXNpbmcgT2JqZWN0LmFzc2lnbiwgaXQgaGFzIHRvIHdvcmsgaW4gRVMzIGVudmlyb25tZW50cy5cbiAgICBpZiAoZXhwb3J0cykge1xuICAgICAgZm9yIChjb25zdCBrZXk6IHN0cmluZyBpbiBleHBvcnRzKSB7XG4gICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKGV4cG9ydHMsIGtleSkpIHtcbiAgICAgICAgICBpbXBvcnRlZEFsbFtrZXldID0gZXhwb3J0c1trZXldO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaW1wb3J0ZWRBbGwuZGVmYXVsdCA9IGV4cG9ydHM7XG4gIH1cblxuICAvLyAkRmxvd0ZpeE1lW2luY29tcGF0aWJsZS10eXBlXSBUaGUgYG1ldHJvUmVxdWlyZWAgY2FsbCBhYm92ZSB3b3VsZCBoYXZlIHRocm93biBpZiBtb2R1bGVzW2lkXSB3YXMgbnVsbFxuICBjb25zdCBpbml0aWFsaXplZE1vZHVsZTogTW9kdWxlRGVmaW5pdGlvbiA9IG1vZHVsZXMuZ2V0KFxuICAgIG1vZHVsZUlkUmVhbGx5SXNOdW1iZXIsXG4gICk7XG4gIHJldHVybiAoaW5pdGlhbGl6ZWRNb2R1bGUuaW1wb3J0ZWRBbGwgPSBpbXBvcnRlZEFsbCk7XG59XG5tZXRyb1JlcXVpcmUuaW1wb3J0QWxsID0gbWV0cm9JbXBvcnRBbGw7XG5cbi8vIFRoZSBgcmVxdWlyZS5jb250ZXh0KClgIHN5bnRheCBpcyBuZXZlciBleGVjdXRlZCBpbiB0aGUgcnVudGltZSBiZWNhdXNlIGl0IGlzIGNvbnZlcnRlZFxuLy8gdG8gYHJlcXVpcmUoKWAgaW4gYG1ldHJvL3NyYy9Nb2R1bGVHcmFwaC93b3JrZXIvY29sbGVjdERlcGVuZGVuY2llcy5qc2AgYWZ0ZXIgY29sbGVjdGluZ1xuLy8gZGVwZW5kZW5jaWVzLiBJZiB0aGUgZmVhdHVyZSBmbGFnIGlzIG5vdCBlbmFibGVkIHRoZW4gdGhlIGNvbnZlcnNpb24gbmV2ZXIgdGFrZXMgcGxhY2UgYW5kIHRoaXMgZXJyb3IgaXMgdGhyb3duIChkZXZlbG9wbWVudCBvbmx5KS5cbm1ldHJvUmVxdWlyZS5jb250ZXh0ID0gZnVuY3Rpb24gZmFsbGJhY2tSZXF1aXJlQ29udGV4dCgpIHtcbiAgaWYgKF9fREVWX18pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAnVGhlIGV4cGVyaW1lbnRhbCBNZXRybyBmZWF0dXJlIGByZXF1aXJlLmNvbnRleHRgIGlzIG5vdCBlbmFibGVkIGluIHlvdXIgcHJvamVjdC5cXG5UaGlzIGNhbiBiZSBlbmFibGVkIGJ5IHNldHRpbmcgdGhlIGB0cmFuc2Zvcm1lci51bnN0YWJsZV9hbGxvd1JlcXVpcmVDb250ZXh0YCBwcm9wZXJ0eSB0byBgdHJ1ZWAgaW4geW91ciBNZXRybyBjb25maWd1cmF0aW9uLicsXG4gICAgKTtcbiAgfVxuICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgJ1RoZSBleHBlcmltZW50YWwgTWV0cm8gZmVhdHVyZSBgcmVxdWlyZS5jb250ZXh0YCBpcyBub3QgZW5hYmxlZCBpbiB5b3VyIHByb2plY3QuJyxcbiAgKTtcbn07XG5cbi8vIGByZXF1aXJlLnJlc29sdmVXZWFrKClgIGlzIGEgY29tcGlsZS10aW1lIHByaW1pdGl2ZSAoc2VlIGNvbGxlY3REZXBlbmRlbmNpZXMuanMpXG5tZXRyb1JlcXVpcmUucmVzb2x2ZVdlYWsgPSBmdW5jdGlvbiBmYWxsYmFja1JlcXVpcmVSZXNvbHZlV2VhaygpIHtcbiAgaWYgKF9fREVWX18pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAncmVxdWlyZS5yZXNvbHZlV2VhayBjYW5ub3QgYmUgY2FsbGVkIGR5bmFtaWNhbGx5LiBFbnN1cmUgeW91IGFyZSB1c2luZyB0aGUgc2FtZSB2ZXJzaW9uIG9mIGBtZXRyb2AgYW5kIGBtZXRyby1ydW50aW1lYC4nLFxuICAgICk7XG4gIH1cbiAgdGhyb3cgbmV3IEVycm9yKCdyZXF1aXJlLnJlc29sdmVXZWFrIGNhbm5vdCBiZSBjYWxsZWQgZHluYW1pY2FsbHkuJyk7XG59O1xuXG5sZXQgaW5HdWFyZCA9IGZhbHNlO1xuZnVuY3Rpb24gZ3VhcmRlZExvYWRNb2R1bGUoXG4gIG1vZHVsZUlkOiBNb2R1bGVJRCxcbiAgbW9kdWxlOiA/TW9kdWxlRGVmaW5pdGlvbixcbik6IEV4cG9ydHMge1xuICBpZiAoIWluR3VhcmQgJiYgZ2xvYmFsLkVycm9yVXRpbHMpIHtcbiAgICBpbkd1YXJkID0gdHJ1ZTtcbiAgICBsZXQgcmV0dXJuVmFsdWU7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVyblZhbHVlID0gbG9hZE1vZHVsZUltcGxlbWVudGF0aW9uKG1vZHVsZUlkLCBtb2R1bGUpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIC8vIFRPRE86IChtb3RpKSBUNDgyMDQ2OTIgVHlwZSB0aGlzIHVzZSBvZiBFcnJvclV0aWxzLlxuICAgICAgZ2xvYmFsLkVycm9yVXRpbHMucmVwb3J0RmF0YWxFcnJvcihlKTtcbiAgICB9XG4gICAgaW5HdWFyZCA9IGZhbHNlO1xuICAgIHJldHVybiByZXR1cm5WYWx1ZTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbG9hZE1vZHVsZUltcGxlbWVudGF0aW9uKG1vZHVsZUlkLCBtb2R1bGUpO1xuICB9XG59XG5cbmNvbnN0IElEX01BU0tfU0hJRlQgPSAxNjtcbmNvbnN0IExPQ0FMX0lEX01BU0sgPSB+MCA+Pj4gSURfTUFTS19TSElGVDtcblxuZnVuY3Rpb24gdW5wYWNrTW9kdWxlSWQobW9kdWxlSWQ6IE1vZHVsZUlEKToge1xuICBsb2NhbElkOiBudW1iZXIsXG4gIHNlZ21lbnRJZDogbnVtYmVyLFxuICAuLi5cbn0ge1xuICBjb25zdCBzZWdtZW50SWQgPSBtb2R1bGVJZCA+Pj4gSURfTUFTS19TSElGVDtcbiAgY29uc3QgbG9jYWxJZCA9IG1vZHVsZUlkICYgTE9DQUxfSURfTUFTSztcbiAgcmV0dXJuIHtzZWdtZW50SWQsIGxvY2FsSWR9O1xufVxubWV0cm9SZXF1aXJlLnVucGFja01vZHVsZUlkID0gdW5wYWNrTW9kdWxlSWQ7XG5cbmZ1bmN0aW9uIHBhY2tNb2R1bGVJZCh2YWx1ZToge1xuICBsb2NhbElkOiBudW1iZXIsXG4gIHNlZ21lbnRJZDogbnVtYmVyLFxuICAuLi5cbn0pOiBNb2R1bGVJRCB7XG4gIHJldHVybiAodmFsdWUuc2VnbWVudElkIDw8IElEX01BU0tfU0hJRlQpICsgdmFsdWUubG9jYWxJZDtcbn1cbm1ldHJvUmVxdWlyZS5wYWNrTW9kdWxlSWQgPSBwYWNrTW9kdWxlSWQ7XG5cbmNvbnN0IG1vZHVsZURlZmluZXJzQnlTZWdtZW50SUQ6IEFycmF5PD9Nb2R1bGVEZWZpbmVyPiA9IFtdO1xuY29uc3QgZGVmaW5pbmdTZWdtZW50QnlNb2R1bGVJRDogTWFwPE1vZHVsZUlELCBudW1iZXI+ID0gbmV3IE1hcCgpO1xuXG5mdW5jdGlvbiByZWdpc3RlclNlZ21lbnQoXG4gIHNlZ21lbnRJZDogbnVtYmVyLFxuICBtb2R1bGVEZWZpbmVyOiBNb2R1bGVEZWZpbmVyLFxuICBtb2R1bGVJZHM6ID8kUmVhZE9ubHlBcnJheTxNb2R1bGVJRD4sXG4pOiB2b2lkIHtcbiAgbW9kdWxlRGVmaW5lcnNCeVNlZ21lbnRJRFtzZWdtZW50SWRdID0gbW9kdWxlRGVmaW5lcjtcbiAgaWYgKF9fREVWX18pIHtcbiAgICBpZiAoc2VnbWVudElkID09PSAwICYmIG1vZHVsZUlkcykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAncmVnaXN0ZXJTZWdtZW50OiBFeHBlY3RlZCBtb2R1bGVJZHMgdG8gYmUgbnVsbCBmb3IgbWFpbiBzZWdtZW50JyxcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChzZWdtZW50SWQgIT09IDAgJiYgIW1vZHVsZUlkcykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAncmVnaXN0ZXJTZWdtZW50OiBFeHBlY3RlZCBtb2R1bGVJZHMgdG8gYmUgcGFzc2VkIGZvciBzZWdtZW50ICMnICtcbiAgICAgICAgICBzZWdtZW50SWQsXG4gICAgICApO1xuICAgIH1cbiAgfVxuICBpZiAobW9kdWxlSWRzKSB7XG4gICAgbW9kdWxlSWRzLmZvckVhY2gobW9kdWxlSWQgPT4ge1xuICAgICAgaWYgKCFtb2R1bGVzLmhhcyhtb2R1bGVJZCkgJiYgIWRlZmluaW5nU2VnbWVudEJ5TW9kdWxlSUQuaGFzKG1vZHVsZUlkKSkge1xuICAgICAgICBkZWZpbmluZ1NlZ21lbnRCeU1vZHVsZUlELnNldChtb2R1bGVJZCwgc2VnbWVudElkKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBsb2FkTW9kdWxlSW1wbGVtZW50YXRpb24oXG4gIG1vZHVsZUlkOiBNb2R1bGVJRCxcbiAgbW9kdWxlOiA/TW9kdWxlRGVmaW5pdGlvbixcbik6IEV4cG9ydHMge1xuICBpZiAoIW1vZHVsZSAmJiBtb2R1bGVEZWZpbmVyc0J5U2VnbWVudElELmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBzZWdtZW50SWQgPSBkZWZpbmluZ1NlZ21lbnRCeU1vZHVsZUlELmdldChtb2R1bGVJZCkgPz8gMDtcbiAgICBjb25zdCBkZWZpbmVyID0gbW9kdWxlRGVmaW5lcnNCeVNlZ21lbnRJRFtzZWdtZW50SWRdO1xuICAgIGlmIChkZWZpbmVyICE9IG51bGwpIHtcbiAgICAgIGRlZmluZXIobW9kdWxlSWQpO1xuICAgICAgbW9kdWxlID0gbW9kdWxlcy5nZXQobW9kdWxlSWQpO1xuICAgICAgZGVmaW5pbmdTZWdtZW50QnlNb2R1bGVJRC5kZWxldGUobW9kdWxlSWQpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IG5hdGl2ZVJlcXVpcmUgPSBnbG9iYWwubmF0aXZlUmVxdWlyZTtcbiAgaWYgKCFtb2R1bGUgJiYgbmF0aXZlUmVxdWlyZSkge1xuICAgIGNvbnN0IHtzZWdtZW50SWQsIGxvY2FsSWR9ID0gdW5wYWNrTW9kdWxlSWQobW9kdWxlSWQpO1xuICAgIG5hdGl2ZVJlcXVpcmUobG9jYWxJZCwgc2VnbWVudElkKTtcbiAgICBtb2R1bGUgPSBtb2R1bGVzLmdldChtb2R1bGVJZCk7XG4gIH1cblxuICBpZiAoIW1vZHVsZSkge1xuICAgIHRocm93IHVua25vd25Nb2R1bGVFcnJvcihtb2R1bGVJZCk7XG4gIH1cblxuICBpZiAobW9kdWxlLmhhc0Vycm9yKSB7XG4gICAgdGhyb3cgbW9kdWxlLmVycm9yO1xuICB9XG5cbiAgaWYgKF9fREVWX18pIHtcbiAgICB2YXIgU3lzdHJhY2UgPSByZXF1aXJlU3lzdHJhY2UoKTtcbiAgICB2YXIgUmVmcmVzaCA9IHJlcXVpcmVSZWZyZXNoKCk7XG4gIH1cblxuICAvLyBXZSBtdXN0IG9wdGltaXN0aWNhbGx5IG1hcmsgbW9kdWxlIGFzIGluaXRpYWxpemVkIGJlZm9yZSBydW5uaW5nIHRoZVxuICAvLyBmYWN0b3J5IHRvIGtlZXAgYW55IHJlcXVpcmUgY3ljbGVzIGluc2lkZSB0aGUgZmFjdG9yeSBmcm9tIGNhdXNpbmcgYW5cbiAgLy8gaW5maW5pdGUgcmVxdWlyZSBsb29wLlxuICBtb2R1bGUuaXNJbml0aWFsaXplZCA9IHRydWU7XG5cbiAgY29uc3Qge2ZhY3RvcnksIGRlcGVuZGVuY3lNYXB9ID0gbW9kdWxlO1xuICBpZiAoX19ERVZfXykge1xuICAgIGluaXRpYWxpemluZ01vZHVsZUlkcy5wdXNoKG1vZHVsZUlkKTtcbiAgfVxuICB0cnkge1xuICAgIGlmIChfX0RFVl9fKSB7XG4gICAgICAvLyAkRmxvd0ZpeE1lW2luY29tcGF0aWJsZS11c2VdOiB3ZSBrbm93IHRoYXQgX19ERVZfXyBpcyBjb25zdCBhbmQgYFN5c3RyYWNlYCBleGlzdHNcbiAgICAgIFN5c3RyYWNlLmJlZ2luRXZlbnQoJ0pTX3JlcXVpcmVfJyArIChtb2R1bGUudmVyYm9zZU5hbWUgfHwgbW9kdWxlSWQpKTtcbiAgICB9XG5cbiAgICBjb25zdCBtb2R1bGVPYmplY3Q6IE1vZHVsZSA9IG1vZHVsZS5wdWJsaWNNb2R1bGU7XG5cbiAgICBpZiAoX19ERVZfXykge1xuICAgICAgbW9kdWxlT2JqZWN0LmhvdCA9IG1vZHVsZS5ob3Q7XG5cbiAgICAgIHZhciBwcmV2UmVmcmVzaFJlZyA9IGdsb2JhbC4kUmVmcmVzaFJlZyQ7XG4gICAgICB2YXIgcHJldlJlZnJlc2hTaWcgPSBnbG9iYWwuJFJlZnJlc2hTaWckO1xuICAgICAgaWYgKFJlZnJlc2ggIT0gbnVsbCkge1xuICAgICAgICBjb25zdCBSZWZyZXNoUnVudGltZSA9IFJlZnJlc2g7XG4gICAgICAgIGdsb2JhbC4kUmVmcmVzaFJlZyQgPSAodHlwZSwgaWQpID0+IHtcbiAgICAgICAgICAvLyBwcmVmaXggdGhlIGlkIHdpdGggZ2xvYmFsIHByZWZpeCB0byBlbmFibGUgbXVsdGlwbGUgSE1SIGNsaWVudHNcbiAgICAgICAgICBjb25zdCBwcmVmaXhlZE1vZHVsZUlkID1cbiAgICAgICAgICAgIF9fTUVUUk9fR0xPQkFMX1BSRUZJWF9fICsgJyAnICsgbW9kdWxlSWQgKyAnICcgKyBpZDtcbiAgICAgICAgICBSZWZyZXNoUnVudGltZS5yZWdpc3Rlcih0eXBlLCBwcmVmaXhlZE1vZHVsZUlkKTtcbiAgICAgICAgfTtcbiAgICAgICAgZ2xvYmFsLiRSZWZyZXNoU2lnJCA9XG4gICAgICAgICAgUmVmcmVzaFJ1bnRpbWUuY3JlYXRlU2lnbmF0dXJlRnVuY3Rpb25Gb3JUcmFuc2Zvcm07XG4gICAgICB9XG4gICAgfVxuICAgIG1vZHVsZU9iamVjdC5pZCA9IG1vZHVsZUlkO1xuXG4gICAgLy8ga2VlcCBhcmdzIGluIHN5bmMgd2l0aCB3aXRoIGRlZmluZU1vZHVsZUNvZGUgaW5cbiAgICAvLyBtZXRyby9zcmMvUmVzb2x2ZXIvaW5kZXguanNcbiAgICAvLyBhbmQgbWV0cm8vc3JjL01vZHVsZUdyYXBoL3dvcmtlci5qc1xuICAgIGZhY3RvcnkoXG4gICAgICBnbG9iYWwsXG4gICAgICBtZXRyb1JlcXVpcmUsXG4gICAgICBtZXRyb0ltcG9ydERlZmF1bHQsXG4gICAgICBtZXRyb0ltcG9ydEFsbCxcbiAgICAgIG1vZHVsZU9iamVjdCxcbiAgICAgIG1vZHVsZU9iamVjdC5leHBvcnRzLFxuICAgICAgZGVwZW5kZW5jeU1hcCxcbiAgICApO1xuXG4gICAgLy8gYXZvaWQgcmVtb3ZpbmcgZmFjdG9yeSBpbiBERVYgbW9kZSBhcyBpdCBicmVha3MgSE1SXG4gICAgaWYgKCFfX0RFVl9fKSB7XG4gICAgICAvLyAkRmxvd0ZpeE1lW2luY29tcGF0aWJsZS10eXBlXTogVGhpcyBpcyBvbmx5IHNvdW5kIGJlY2F1c2Ugd2UgbmV2ZXIgYWNjZXNzIGBmYWN0b3J5YCBhZ2FpblxuICAgICAgbW9kdWxlLmZhY3RvcnkgPSB1bmRlZmluZWQ7XG4gICAgICBtb2R1bGUuZGVwZW5kZW5jeU1hcCA9IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBpZiAoX19ERVZfXykge1xuICAgICAgLy8gJEZsb3dGaXhNZVtpbmNvbXBhdGlibGUtdXNlXTogd2Uga25vdyB0aGF0IF9fREVWX18gaXMgY29uc3QgYW5kIGBTeXN0cmFjZWAgZXhpc3RzXG4gICAgICBTeXN0cmFjZS5lbmRFdmVudCgpO1xuXG4gICAgICBpZiAoUmVmcmVzaCAhPSBudWxsKSB7XG4gICAgICAgIC8vIHByZWZpeCB0aGUgaWQgd2l0aCBnbG9iYWwgcHJlZml4IHRvIGVuYWJsZSBtdWx0aXBsZSBITVIgY2xpZW50c1xuICAgICAgICBjb25zdCBwcmVmaXhlZE1vZHVsZUlkID0gX19NRVRST19HTE9CQUxfUFJFRklYX18gKyAnICcgKyBtb2R1bGVJZDtcbiAgICAgICAgcmVnaXN0ZXJFeHBvcnRzRm9yUmVhY3RSZWZyZXNoKFxuICAgICAgICAgIFJlZnJlc2gsXG4gICAgICAgICAgbW9kdWxlT2JqZWN0LmV4cG9ydHMsXG4gICAgICAgICAgcHJlZml4ZWRNb2R1bGVJZCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gbW9kdWxlT2JqZWN0LmV4cG9ydHM7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBtb2R1bGUuaGFzRXJyb3IgPSB0cnVlO1xuICAgIG1vZHVsZS5lcnJvciA9IGU7XG4gICAgbW9kdWxlLmlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgICBtb2R1bGUucHVibGljTW9kdWxlLmV4cG9ydHMgPSB1bmRlZmluZWQ7XG4gICAgdGhyb3cgZTtcbiAgfSBmaW5hbGx5IHtcbiAgICBpZiAoX19ERVZfXykge1xuICAgICAgaWYgKGluaXRpYWxpemluZ01vZHVsZUlkcy5wb3AoKSAhPT0gbW9kdWxlSWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICdpbml0aWFsaXppbmdNb2R1bGVJZHMgaXMgY29ycnVwdDsgc29tZXRoaW5nIGlzIHRlcnJpYmx5IHdyb25nJyxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGdsb2JhbC4kUmVmcmVzaFJlZyQgPSBwcmV2UmVmcmVzaFJlZztcbiAgICAgIGdsb2JhbC4kUmVmcmVzaFNpZyQgPSBwcmV2UmVmcmVzaFNpZztcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdW5rbm93bk1vZHVsZUVycm9yKGlkOiBNb2R1bGVJRCk6IEVycm9yIHtcbiAgbGV0IG1lc3NhZ2UgPSAnUmVxdWlyaW5nIHVua25vd24gbW9kdWxlIFwiJyArIGlkICsgJ1wiLic7XG4gIGlmIChfX0RFVl9fKSB7XG4gICAgbWVzc2FnZSArPVxuICAgICAgJyBJZiB5b3UgYXJlIHN1cmUgdGhlIG1vZHVsZSBleGlzdHMsIHRyeSByZXN0YXJ0aW5nIE1ldHJvLiAnICtcbiAgICAgICdZb3UgbWF5IGFsc28gd2FudCB0byBydW4gYHlhcm5gIG9yIGBucG0gaW5zdGFsbGAuJztcbiAgfVxuICByZXR1cm4gRXJyb3IobWVzc2FnZSk7XG59XG5cbmlmIChfX0RFVl9fKSB7XG4gIC8vICRGbG93Rml4TWVbcHJvcC1taXNzaW5nXVxuICBtZXRyb1JlcXVpcmUuU3lzdHJhY2UgPSB7XG4gICAgYmVnaW5FdmVudDogKCk6IHZvaWQgPT4ge30sXG4gICAgZW5kRXZlbnQ6ICgpOiB2b2lkID0+IHt9LFxuICB9O1xuICAvLyAkRmxvd0ZpeE1lW3Byb3AtbWlzc2luZ11cbiAgbWV0cm9SZXF1aXJlLmdldE1vZHVsZXMgPSAoKTogTW9kdWxlTGlzdCA9PiB7XG4gICAgcmV0dXJuIG1vZHVsZXM7XG4gIH07XG5cbiAgLy8gSE9UIE1PRFVMRSBSRUxPQURJTkdcbiAgdmFyIGNyZWF0ZUhvdFJlbG9hZGluZ09iamVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgICBjb25zdCBob3Q6IEhvdE1vZHVsZVJlbG9hZGluZ0RhdGEgPSB7XG4gICAgICBfYWNjZXB0Q2FsbGJhY2s6IG51bGwsXG4gICAgICBfZGlzcG9zZUNhbGxiYWNrOiBudWxsLFxuICAgICAgX2RpZEFjY2VwdDogZmFsc2UsXG4gICAgICBhY2NlcHQ6IChjYWxsYmFjaz86IEhvdE1vZHVsZVJlbG9hZGluZ0NhbGxiYWNrKTogdm9pZCA9PiB7XG4gICAgICAgIGhvdC5fZGlkQWNjZXB0ID0gdHJ1ZTtcbiAgICAgICAgaG90Ll9hY2NlcHRDYWxsYmFjayA9IGNhbGxiYWNrO1xuICAgICAgfSxcbiAgICAgIGRpc3Bvc2U6IChjYWxsYmFjaz86IEhvdE1vZHVsZVJlbG9hZGluZ0NhbGxiYWNrKTogdm9pZCA9PiB7XG4gICAgICAgIGhvdC5fZGlzcG9zZUNhbGxiYWNrID0gY2FsbGJhY2s7XG4gICAgICB9LFxuICAgIH07XG4gICAgcmV0dXJuIGhvdDtcbiAgfTtcblxuICBsZXQgcmVhY3RSZWZyZXNoVGltZW91dDogbnVsbCB8IFRpbWVvdXRJRCA9IG51bGw7XG5cbiAgY29uc3QgbWV0cm9Ib3RVcGRhdGVNb2R1bGUgPSBmdW5jdGlvbiAoXG4gICAgaWQ6IE1vZHVsZUlELFxuICAgIGZhY3Rvcnk6IEZhY3RvcnlGbixcbiAgICBkZXBlbmRlbmN5TWFwOiBEZXBlbmRlbmN5TWFwLFxuICAgIGludmVyc2VEZXBlbmRlbmNpZXM6IEludmVyc2VEZXBlbmRlbmN5TWFwLFxuICApIHtcbiAgICBjb25zdCBtb2QgPSBtb2R1bGVzLmdldChpZCk7XG4gICAgaWYgKCFtb2QpIHtcbiAgICAgIC8qICRGbG93Rml4TWVbY29uc3RhbnQtY29uZGl0aW9uXSBFcnJvciBkaXNjb3ZlcmVkIGR1cmluZyBDb25zdGFudFxuICAgICAgICogQ29uZGl0aW9uIHJvbGwgb3V0LiBTZWUgaHR0cHM6Ly9mYnVybC5jb20vd29ya3BsYWNlLzF2OTd2aW1xLiAqL1xuICAgICAgaWYgKGZhY3RvcnkpIHtcbiAgICAgICAgLy8gTmV3IG1vZHVsZXMgYXJlIGdvaW5nIHRvIGJlIGhhbmRsZWQgYnkgdGhlIGRlZmluZSgpIG1ldGhvZC5cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdGhyb3cgdW5rbm93bk1vZHVsZUVycm9yKGlkKTtcbiAgICB9XG5cbiAgICBpZiAoIW1vZC5oYXNFcnJvciAmJiAhbW9kLmlzSW5pdGlhbGl6ZWQpIHtcbiAgICAgIC8vIFRoZSBtb2R1bGUgaGFzbid0IGFjdHVhbGx5IGJlZW4gZXhlY3V0ZWQgeWV0LFxuICAgICAgLy8gc28gd2UgY2FuIGFsd2F5cyBzYWZlbHkgcmVwbGFjZSBpdC5cbiAgICAgIG1vZC5mYWN0b3J5ID0gZmFjdG9yeTtcbiAgICAgIG1vZC5kZXBlbmRlbmN5TWFwID0gZGVwZW5kZW5jeU1hcDtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBSZWZyZXNoID0gcmVxdWlyZVJlZnJlc2goKTtcbiAgICBjb25zdCByZWZyZXNoQm91bmRhcnlJRHMgPSBuZXcgU2V0PE1vZHVsZUlEPigpO1xuXG4gICAgLy8gSW4gdGhpcyBsb29wLCB3ZSB3aWxsIHRyYXZlcnNlIHRoZSBkZXBlbmRlbmN5IHRyZWUgdXB3YXJkcyBmcm9tIHRoZVxuICAgIC8vIGNoYW5nZWQgbW9kdWxlLiBVcGRhdGVzIFwiYnViYmxlXCIgdXAgdG8gdGhlIGNsb3Nlc3QgYWNjZXB0ZWQgcGFyZW50LlxuICAgIC8vXG4gICAgLy8gSWYgd2UgcmVhY2ggdGhlIG1vZHVsZSByb290IGFuZCBub3RoaW5nIGFsb25nIHRoZSB3YXkgYWNjZXB0ZWQgdGhlIHVwZGF0ZSxcbiAgICAvLyB3ZSBrbm93IGhvdCByZWxvYWQgaXMgZ29pbmcgdG8gZmFpbC4gSW4gdGhhdCBjYXNlIHdlIHJldHVybiBmYWxzZS5cbiAgICAvL1xuICAgIC8vIFRoZSBtYWluIHB1cnBvc2Ugb2YgdGhpcyBsb29wIGlzIHRvIGZpZ3VyZSBvdXQgd2hldGhlciBpdCdzIHNhZmUgdG8gYXBwbHlcbiAgICAvLyBhIGhvdCB1cGRhdGUuIEl0IGlzIG9ubHkgc2FmZSB3aGVuIHRoZSB1cGRhdGUgd2FzIGFjY2VwdGVkIHNvbWV3aGVyZVxuICAgIC8vIGFsb25nIHRoZSB3YXkgdXB3YXJkcyBmb3IgZWFjaCBvZiBpdHMgcGFyZW50IGRlcGVuZGVuY3kgbW9kdWxlIGNoYWlucy5cbiAgICAvL1xuICAgIC8vIFdlIHBlcmZvcm0gYSB0b3BvbG9naWNhbCBzb3J0IGJlY2F1c2Ugd2UgbWF5IGRpc2NvdmVyIHRoZSBzYW1lXG4gICAgLy8gbW9kdWxlIG1vcmUgdGhhbiBvbmNlIGluIHRoZSBsaXN0IG9mIHRoaW5ncyB0byByZS1leGVjdXRlLCBhbmRcbiAgICAvLyB3ZSB3YW50IHRvIGV4ZWN1dGUgbW9kdWxlcyBiZWZvcmUgbW9kdWxlcyB0aGF0IGRlcGVuZCBvbiB0aGVtLlxuICAgIC8vXG4gICAgLy8gSWYgd2UgZGlkbid0IGhhdmUgdGhpcyBjaGVjaywgd2UnZCByaXNrIHJlLWV2YWx1YXRpbmcgbW9kdWxlcyB0aGF0XG4gICAgLy8gaGF2ZSBzaWRlIGVmZmVjdHMgYW5kIGxlYWQgdG8gY29uZnVzaW5nIGFuZCBtZWFuaW5nbGVzcyBjcmFzaGVzLlxuXG4gICAgbGV0IGRpZEJhaWxPdXQgPSBmYWxzZTtcbiAgICBsZXQgdXBkYXRlZE1vZHVsZUlEcztcbiAgICB0cnkge1xuICAgICAgdXBkYXRlZE1vZHVsZUlEcyA9IHRvcG9sb2dpY2FsU29ydChcbiAgICAgICAgW2lkXSwgLy8gU3RhcnQgd2l0aCB0aGUgY2hhbmdlZCBtb2R1bGUgYW5kIGdvIHVwd2FyZHNcbiAgICAgICAgcGVuZGluZ0lEID0+IHtcbiAgICAgICAgICBjb25zdCBwZW5kaW5nTW9kdWxlID0gbW9kdWxlcy5nZXQocGVuZGluZ0lEKTtcbiAgICAgICAgICBpZiAocGVuZGluZ01vZHVsZSA9PSBudWxsKSB7XG4gICAgICAgICAgICAvLyBOb3RoaW5nIHRvIGRvLlxuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBwZW5kaW5nSG90ID0gcGVuZGluZ01vZHVsZS5ob3Q7XG4gICAgICAgICAgaWYgKHBlbmRpbmdIb3QgPT0gbnVsbCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAnW1JlZnJlc2hdIEV4cGVjdGVkIG1vZHVsZS5ob3QgdG8gYWx3YXlzIGV4aXN0IGluIERFVi4nLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gQSBtb2R1bGUgY2FuIGJlIGFjY2VwdGVkIG1hbnVhbGx5IGZyb20gd2l0aGluIGl0c2VsZi5cbiAgICAgICAgICBsZXQgY2FuQWNjZXB0ID0gcGVuZGluZ0hvdC5fZGlkQWNjZXB0O1xuICAgICAgICAgIGlmICghY2FuQWNjZXB0ICYmIFJlZnJlc2ggIT0gbnVsbCkge1xuICAgICAgICAgICAgLy8gT3IgUmVhY3QgUmVmcmVzaCBtYXkgbWFyayBpdCBhY2NlcHRlZCBiYXNlZCBvbiBleHBvcnRzLlxuICAgICAgICAgICAgY29uc3QgaXNCb3VuZGFyeSA9IGlzUmVhY3RSZWZyZXNoQm91bmRhcnkoXG4gICAgICAgICAgICAgIFJlZnJlc2gsXG4gICAgICAgICAgICAgIHBlbmRpbmdNb2R1bGUucHVibGljTW9kdWxlLmV4cG9ydHMsXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKGlzQm91bmRhcnkpIHtcbiAgICAgICAgICAgICAgY2FuQWNjZXB0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgcmVmcmVzaEJvdW5kYXJ5SURzLmFkZChwZW5kaW5nSUQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoY2FuQWNjZXB0KSB7XG4gICAgICAgICAgICAvLyBEb24ndCBsb29rIGF0IHBhcmVudHMuXG4gICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIElmIHdlIGJ1YmJsZSB0aHJvdWdoIHRoZSByb29mLCB0aGVyZSBpcyBubyB3YXkgdG8gZG8gYSBob3QgdXBkYXRlLlxuICAgICAgICAgIC8vIEJhaWwgb3V0IGFsdG9nZXRoZXIuIFRoaXMgaXMgdGhlIGZhaWx1cmUgY2FzZS5cbiAgICAgICAgICBjb25zdCBwYXJlbnRJRHMgPSBpbnZlcnNlRGVwZW5kZW5jaWVzW3BlbmRpbmdJRF07XG4gICAgICAgICAgaWYgKHBhcmVudElEcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIC8vIFJlbG9hZCB0aGUgYXBwIGJlY2F1c2UgdGhlIGhvdCByZWxvYWQgY2FuJ3Qgc3VjY2VlZC5cbiAgICAgICAgICAgIC8vIFRoaXMgc2hvdWxkIHdvcmsgYm90aCBvbiB3ZWIgYW5kIFJlYWN0IE5hdGl2ZS5cbiAgICAgICAgICAgIHBlcmZvcm1GdWxsUmVmcmVzaCgnTm8gcm9vdCBib3VuZGFyeScsIHtcbiAgICAgICAgICAgICAgc291cmNlOiBtb2QsXG4gICAgICAgICAgICAgIGZhaWxlZDogcGVuZGluZ01vZHVsZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgZGlkQmFpbE91dCA9IHRydWU7XG4gICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFRoaXMgbW9kdWxlIGNhbid0IGhhbmRsZSB0aGUgdXBkYXRlIGJ1dCBtYXliZSBhbGwgaXRzIHBhcmVudHMgY2FuP1xuICAgICAgICAgIC8vIFB1dCB0aGVtIGFsbCBpbiB0aGUgcXVldWUgdG8gcnVuIHRoZSBzYW1lIHNldCBvZiBjaGVja3MuXG4gICAgICAgICAgcmV0dXJuIHBhcmVudElEcztcbiAgICAgICAgfSxcbiAgICAgICAgKCkgPT4gZGlkQmFpbE91dCwgLy8gU2hvdWxkIHdlIHN0b3A/XG4gICAgICApLnJldmVyc2UoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoZSA9PT0gQ1lDTEVfREVURUNURUQpIHtcbiAgICAgICAgcGVyZm9ybUZ1bGxSZWZyZXNoKCdEZXBlbmRlbmN5IGN5Y2xlJywge1xuICAgICAgICAgIHNvdXJjZTogbW9kLFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9XG5cbiAgICBpZiAoZGlkQmFpbE91dCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIElmIHdlIHJlYWNoZWQgaGVyZSwgaXQgaXMgbGlrZWx5IHRoYXQgaG90IHJlbG9hZCB3aWxsIGJlIHN1Y2Nlc3NmdWwuXG4gICAgLy8gUnVuIHRoZSBhY3R1YWwgZmFjdG9yaWVzLlxuICAgIGNvbnN0IHNlZW5Nb2R1bGVJRHMgPSBuZXcgU2V0PE1vZHVsZUlEPigpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdXBkYXRlZE1vZHVsZUlEcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgdXBkYXRlZElEID0gdXBkYXRlZE1vZHVsZUlEc1tpXTtcbiAgICAgIGlmIChzZWVuTW9kdWxlSURzLmhhcyh1cGRhdGVkSUQpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgc2Vlbk1vZHVsZUlEcy5hZGQodXBkYXRlZElEKTtcblxuICAgICAgY29uc3QgdXBkYXRlZE1vZCA9IG1vZHVsZXMuZ2V0KHVwZGF0ZWRJRCk7XG4gICAgICBpZiAodXBkYXRlZE1vZCA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignW1JlZnJlc2hdIEV4cGVjdGVkIHRvIGZpbmQgdGhlIHVwZGF0ZWQgbW9kdWxlLicpO1xuICAgICAgfVxuICAgICAgY29uc3QgcHJldkV4cG9ydHMgPSB1cGRhdGVkTW9kLnB1YmxpY01vZHVsZS5leHBvcnRzO1xuICAgICAgY29uc3QgZGlkRXJyb3IgPSBydW5VcGRhdGVkTW9kdWxlKFxuICAgICAgICB1cGRhdGVkSUQsXG4gICAgICAgIHVwZGF0ZWRJRCA9PT0gaWQgPyBmYWN0b3J5IDogdW5kZWZpbmVkLFxuICAgICAgICB1cGRhdGVkSUQgPT09IGlkID8gZGVwZW5kZW5jeU1hcCA6IHVuZGVmaW5lZCxcbiAgICAgICk7XG4gICAgICBjb25zdCBuZXh0RXhwb3J0cyA9IHVwZGF0ZWRNb2QucHVibGljTW9kdWxlLmV4cG9ydHM7XG5cbiAgICAgIGlmIChkaWRFcnJvcikge1xuICAgICAgICAvLyBUaGUgdXNlciB3YXMgc2hvd24gYSByZWRib3ggYWJvdXQgbW9kdWxlIGluaXRpYWxpemF0aW9uLlxuICAgICAgICAvLyBUaGVyZSdzIG5vdGhpbmcgZm9yIHVzIHRvIGRvIGhlcmUgdW50aWwgaXQncyBmaXhlZC5cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVmcmVzaEJvdW5kYXJ5SURzLmhhcyh1cGRhdGVkSUQpKSB7XG4gICAgICAgIC8vIFNpbmNlIHdlIGp1c3QgZXhlY3V0ZWQgdGhlIGNvZGUgZm9yIGl0LCBpdCdzIHBvc3NpYmxlXG4gICAgICAgIC8vIHRoYXQgdGhlIG5ldyBleHBvcnRzIG1ha2UgaXQgaW5lbGlnaWJsZSBmb3IgYmVpbmcgYSBib3VuZGFyeS5cbiAgICAgICAgY29uc3QgaXNOb0xvbmdlckFCb3VuZGFyeSA9ICFpc1JlYWN0UmVmcmVzaEJvdW5kYXJ5KFxuICAgICAgICAgIFJlZnJlc2gsXG4gICAgICAgICAgbmV4dEV4cG9ydHMsXG4gICAgICAgICk7XG4gICAgICAgIC8vIEl0IGNhbiBhbHNvIGJlY29tZSBpbmVsaWdpYmxlIGlmIGl0cyBleHBvcnRzIGFyZSBpbmNvbXBhdGlibGVcbiAgICAgICAgLy8gd2l0aCB0aGUgcHJldmlvdXMgZXhwb3J0cy5cbiAgICAgICAgLy8gRm9yIGV4YW1wbGUsIGlmIHlvdSBhZGQvcmVtb3ZlL2NoYW5nZSBleHBvcnRzLCB3ZSdsbCB3YW50XG4gICAgICAgIC8vIHRvIHJlLWV4ZWN1dGUgdGhlIGltcG9ydGluZyBtb2R1bGVzLCBhbmQgZm9yY2UgdGhvc2UgY29tcG9uZW50c1xuICAgICAgICAvLyB0byByZS1yZW5kZXIuIFNpbWlsYXJseSwgaWYgeW91IGNvbnZlcnQgYSBjbGFzcyBjb21wb25lbnRcbiAgICAgICAgLy8gdG8gYSBmdW5jdGlvbiwgd2Ugd2FudCB0byBpbnZhbGlkYXRlIHRoZSBib3VuZGFyeS5cbiAgICAgICAgY29uc3QgZGlkSW52YWxpZGF0ZSA9IHNob3VsZEludmFsaWRhdGVSZWFjdFJlZnJlc2hCb3VuZGFyeShcbiAgICAgICAgICBSZWZyZXNoLFxuICAgICAgICAgIHByZXZFeHBvcnRzLFxuICAgICAgICAgIG5leHRFeHBvcnRzLFxuICAgICAgICApO1xuICAgICAgICBpZiAoaXNOb0xvbmdlckFCb3VuZGFyeSB8fCBkaWRJbnZhbGlkYXRlKSB7XG4gICAgICAgICAgLy8gV2UnbGwgYmUgY29uc2VydmF0aXZlLiBUaGUgb25seSBjYXNlIGluIHdoaWNoIHdlIHdvbid0IGRvIGEgZnVsbFxuICAgICAgICAgIC8vIHJlbG9hZCBpcyBpZiBhbGwgcGFyZW50IG1vZHVsZXMgYXJlIGFsc28gcmVmcmVzaCBib3VuZGFyaWVzLlxuICAgICAgICAgIC8vIEluIHRoYXQgY2FzZSB3ZSdsbCBhZGQgdGhlbSB0byB0aGUgY3VycmVudCBxdWV1ZS5cbiAgICAgICAgICBjb25zdCBwYXJlbnRJRHMgPSBpbnZlcnNlRGVwZW5kZW5jaWVzW3VwZGF0ZWRJRF07XG4gICAgICAgICAgaWYgKHBhcmVudElEcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIC8vIExvb2tzIGxpa2Ugd2UgYnViYmxlZCB0byB0aGUgcm9vdC4gQ2FuJ3QgcmVjb3ZlciBmcm9tIHRoYXQuXG4gICAgICAgICAgICBwZXJmb3JtRnVsbFJlZnJlc2goXG4gICAgICAgICAgICAgIGlzTm9Mb25nZXJBQm91bmRhcnlcbiAgICAgICAgICAgICAgICA/ICdObyBsb25nZXIgYSBib3VuZGFyeSdcbiAgICAgICAgICAgICAgICA6ICdJbnZhbGlkYXRlZCBib3VuZGFyeScsXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBzb3VyY2U6IG1vZCxcbiAgICAgICAgICAgICAgICBmYWlsZWQ6IHVwZGF0ZWRNb2QsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBTY2hlZHVsZSBhbGwgcGFyZW50IHJlZnJlc2ggYm91bmRhcmllcyB0byByZS1ydW4gaW4gdGhpcyBsb29wLlxuICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgcGFyZW50SURzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICBjb25zdCBwYXJlbnRJRCA9IHBhcmVudElEc1tqXTtcbiAgICAgICAgICAgIGNvbnN0IHBhcmVudE1vZCA9IG1vZHVsZXMuZ2V0KHBhcmVudElEKTtcbiAgICAgICAgICAgIGlmIChwYXJlbnRNb2QgPT0gbnVsbCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1tSZWZyZXNoXSBFeHBlY3RlZCB0byBmaW5kIHBhcmVudCBtb2R1bGUuJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjYW5BY2NlcHRQYXJlbnQgPSBpc1JlYWN0UmVmcmVzaEJvdW5kYXJ5KFxuICAgICAgICAgICAgICBSZWZyZXNoLFxuICAgICAgICAgICAgICBwYXJlbnRNb2QucHVibGljTW9kdWxlLmV4cG9ydHMsXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKGNhbkFjY2VwdFBhcmVudCkge1xuICAgICAgICAgICAgICAvLyBBbGwgcGFyZW50cyB3aWxsIGhhdmUgdG8gcmUtcnVuIHRvby5cbiAgICAgICAgICAgICAgcmVmcmVzaEJvdW5kYXJ5SURzLmFkZChwYXJlbnRJRCk7XG4gICAgICAgICAgICAgIHVwZGF0ZWRNb2R1bGVJRHMucHVzaChwYXJlbnRJRCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwZXJmb3JtRnVsbFJlZnJlc2goJ0ludmFsaWRhdGVkIGJvdW5kYXJ5Jywge1xuICAgICAgICAgICAgICAgIHNvdXJjZTogbW9kLFxuICAgICAgICAgICAgICAgIGZhaWxlZDogcGFyZW50TW9kLFxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChSZWZyZXNoICE9IG51bGwpIHtcbiAgICAgIC8vIERlYm91bmNlIGEgbGl0dGxlIGluIGNhc2UgdGhlcmUgYXJlIG11bHRpcGxlIHVwZGF0ZXMgcXVldWVkIHVwLlxuICAgICAgLy8gVGhpcyBpcyBhbHNvIHVzZWZ1bCBiZWNhdXNlIF9fYWNjZXB0IG1heSBiZSBjYWxsZWQgbXVsdGlwbGUgdGltZXMuXG4gICAgICBpZiAocmVhY3RSZWZyZXNoVGltZW91dCA9PSBudWxsKSB7XG4gICAgICAgIHJlYWN0UmVmcmVzaFRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICByZWFjdFJlZnJlc2hUaW1lb3V0ID0gbnVsbDtcbiAgICAgICAgICAvLyBVcGRhdGUgUmVhY3QgY29tcG9uZW50cy5cbiAgICAgICAgICBSZWZyZXNoLnBlcmZvcm1SZWFjdFJlZnJlc2goKTtcbiAgICAgICAgfSwgMzApO1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICBjb25zdCB0b3BvbG9naWNhbFNvcnQgPSBmdW5jdGlvbiA8VD4oXG4gICAgcm9vdHM6IEFycmF5PFQ+LFxuICAgIGdldEVkZ2VzOiBUID0+IEFycmF5PFQ+LFxuICAgIGVhcmx5U3RvcDogVCA9PiBib29sZWFuLFxuICApOiBBcnJheTxUPiB7XG4gICAgY29uc3QgcmVzdWx0ID0gW107XG4gICAgY29uc3QgdmlzaXRlZCA9IG5ldyBTZXQ8bWl4ZWQ+KCk7XG4gICAgY29uc3Qgc3RhY2sgPSBuZXcgU2V0PG1peGVkPigpO1xuICAgIGZ1bmN0aW9uIHRyYXZlcnNlRGVwZW5kZW50Tm9kZXMobm9kZTogVCk6IHZvaWQge1xuICAgICAgaWYgKHN0YWNrLmhhcyhub2RlKSkge1xuICAgICAgICB0aHJvdyBDWUNMRV9ERVRFQ1RFRDtcbiAgICAgIH1cbiAgICAgIGlmICh2aXNpdGVkLmhhcyhub2RlKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB2aXNpdGVkLmFkZChub2RlKTtcbiAgICAgIHN0YWNrLmFkZChub2RlKTtcbiAgICAgIGNvbnN0IGRlcGVuZGVudE5vZGVzID0gZ2V0RWRnZXMobm9kZSk7XG4gICAgICBpZiAoZWFybHlTdG9wKG5vZGUpKSB7XG4gICAgICAgIHN0YWNrLmRlbGV0ZShub2RlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgZGVwZW5kZW50Tm9kZXMuZm9yRWFjaChkZXBlbmRlbnQgPT4ge1xuICAgICAgICB0cmF2ZXJzZURlcGVuZGVudE5vZGVzKGRlcGVuZGVudCk7XG4gICAgICB9KTtcbiAgICAgIHN0YWNrLmRlbGV0ZShub2RlKTtcbiAgICAgIHJlc3VsdC5wdXNoKG5vZGUpO1xuICAgIH1cbiAgICByb290cy5mb3JFYWNoKHJvb3QgPT4ge1xuICAgICAgdHJhdmVyc2VEZXBlbmRlbnROb2Rlcyhyb290KTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIGNvbnN0IHJ1blVwZGF0ZWRNb2R1bGUgPSBmdW5jdGlvbiAoXG4gICAgaWQ6IE1vZHVsZUlELFxuICAgIGZhY3Rvcnk/OiBGYWN0b3J5Rm4sXG4gICAgZGVwZW5kZW5jeU1hcD86IERlcGVuZGVuY3lNYXAsXG4gICk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IG1vZCA9IG1vZHVsZXMuZ2V0KGlkKTtcbiAgICBpZiAobW9kID09IG51bGwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignW1JlZnJlc2hdIEV4cGVjdGVkIHRvIGZpbmQgdGhlIG1vZHVsZS4nKTtcbiAgICB9XG5cbiAgICBjb25zdCB7aG90fSA9IG1vZDtcbiAgICBpZiAoIWhvdCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdbUmVmcmVzaF0gRXhwZWN0ZWQgbW9kdWxlLmhvdCB0byBhbHdheXMgZXhpc3QgaW4gREVWLicpO1xuICAgIH1cblxuICAgIGlmIChob3QuX2Rpc3Bvc2VDYWxsYmFjaykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaG90Ll9kaXNwb3NlQ2FsbGJhY2soKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgYEVycm9yIHdoaWxlIGNhbGxpbmcgZGlzcG9zZSBoYW5kbGVyIGZvciBtb2R1bGUgJHtpZH06IGAsXG4gICAgICAgICAgZXJyb3IsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGZhY3RvcnkpIHtcbiAgICAgIG1vZC5mYWN0b3J5ID0gZmFjdG9yeTtcbiAgICB9XG4gICAgaWYgKGRlcGVuZGVuY3lNYXApIHtcbiAgICAgIG1vZC5kZXBlbmRlbmN5TWFwID0gZGVwZW5kZW5jeU1hcDtcbiAgICB9XG4gICAgbW9kLmhhc0Vycm9yID0gZmFsc2U7XG4gICAgbW9kLmVycm9yID0gdW5kZWZpbmVkO1xuICAgIG1vZC5pbXBvcnRlZEFsbCA9IEVNUFRZO1xuICAgIG1vZC5pbXBvcnRlZERlZmF1bHQgPSBFTVBUWTtcbiAgICBtb2QuaXNJbml0aWFsaXplZCA9IGZhbHNlO1xuICAgIGNvbnN0IHByZXZFeHBvcnRzID0gbW9kLnB1YmxpY01vZHVsZS5leHBvcnRzO1xuICAgIG1vZC5wdWJsaWNNb2R1bGUuZXhwb3J0cyA9IHt9O1xuICAgIGhvdC5fZGlkQWNjZXB0ID0gZmFsc2U7XG4gICAgaG90Ll9hY2NlcHRDYWxsYmFjayA9IG51bGw7XG4gICAgaG90Ll9kaXNwb3NlQ2FsbGJhY2sgPSBudWxsO1xuICAgIG1ldHJvUmVxdWlyZShpZCk7XG5cbiAgICBpZiAobW9kLmhhc0Vycm9yKSB7XG4gICAgICAvLyBUaGlzIGVycm9yIGhhcyBhbHJlYWR5IGJlZW4gcmVwb3J0ZWQgdmlhIGEgcmVkYm94LlxuICAgICAgLy8gV2Uga25vdyBpdCdzIGxpa2VseSBhIHR5cG8gb3Igc29tZSBtaXN0YWtlIHRoYXQgd2FzIGp1c3QgaW50cm9kdWNlZC5cbiAgICAgIC8vIE91ciBnb2FsIG5vdyBpcyB0byBrZWVwIHRoZSByZXN0IG9mIHRoZSBhcHBsaWNhdGlvbiB3b3JraW5nIHNvIHRoYXQgYnlcbiAgICAgIC8vIHRoZSB0aW1lIHVzZXIgZml4ZXMgdGhlIGVycm9yLCB0aGUgYXBwIGlzbid0IGNvbXBsZXRlbHkgZGVzdHJveWVkXG4gICAgICAvLyB1bmRlcm5lYXRoIHRoZSByZWRib3guIFNvIHdlJ2xsIHJldmVydCB0aGUgbW9kdWxlIG9iamVjdCB0byB0aGUgbGFzdFxuICAgICAgLy8gc3VjY2Vzc2Z1bCBleHBvcnQgYW5kIHN0b3AgcHJvcGFnYXRpbmcgdGhpcyB1cGRhdGUuXG4gICAgICBtb2QuaGFzRXJyb3IgPSBmYWxzZTtcbiAgICAgIG1vZC5pc0luaXRpYWxpemVkID0gdHJ1ZTtcbiAgICAgIG1vZC5lcnJvciA9IG51bGw7XG4gICAgICBtb2QucHVibGljTW9kdWxlLmV4cG9ydHMgPSBwcmV2RXhwb3J0cztcbiAgICAgIC8vIFdlIGVycm9yZWQuIFN0b3AgdGhlIHVwZGF0ZS5cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmIChob3QuX2FjY2VwdENhbGxiYWNrKSB7XG4gICAgICB0cnkge1xuICAgICAgICBob3QuX2FjY2VwdENhbGxiYWNrKCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgIGBFcnJvciB3aGlsZSBjYWxsaW5nIGFjY2VwdCBoYW5kbGVyIGZvciBtb2R1bGUgJHtpZH06IGAsXG4gICAgICAgICAgZXJyb3IsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIE5vIGVycm9yLlxuICAgIHJldHVybiBmYWxzZTtcbiAgfTtcblxuICBjb25zdCBwZXJmb3JtRnVsbFJlZnJlc2ggPSAoXG4gICAgcmVhc29uOiBzdHJpbmcsXG4gICAgbW9kdWxlczogJFJlYWRPbmx5PHtcbiAgICAgIHNvdXJjZT86IE1vZHVsZURlZmluaXRpb24sXG4gICAgICBmYWlsZWQ/OiBNb2R1bGVEZWZpbml0aW9uLFxuICAgIH0+LFxuICApID0+IHtcbiAgICAvKiBnbG9iYWwgd2luZG93ICovXG4gICAgaWYgKFxuICAgICAgdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgIHdpbmRvdy5sb2NhdGlvbiAhPSBudWxsICYmXG4gICAgICAvLyAkRmxvd0ZpeE1lW21ldGhvZC11bmJpbmRpbmddXG4gICAgICB0eXBlb2Ygd2luZG93LmxvY2F0aW9uLnJlbG9hZCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICkge1xuICAgICAgd2luZG93LmxvY2F0aW9uLnJlbG9hZCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBSZWZyZXNoID0gcmVxdWlyZVJlZnJlc2goKTtcbiAgICAgIGlmIChSZWZyZXNoICE9IG51bGwpIHtcbiAgICAgICAgY29uc3Qgc291cmNlTmFtZSA9IG1vZHVsZXMuc291cmNlPy52ZXJib3NlTmFtZSA/PyAndW5rbm93bic7XG4gICAgICAgIGNvbnN0IGZhaWxlZE5hbWUgPSBtb2R1bGVzLmZhaWxlZD8udmVyYm9zZU5hbWUgPz8gJ3Vua25vd24nO1xuICAgICAgICBSZWZyZXNoLnBlcmZvcm1GdWxsUmVmcmVzaChcbiAgICAgICAgICBgRmFzdCBSZWZyZXNoIC0gJHtyZWFzb259IDwke3NvdXJjZU5hbWV9PiA8JHtmYWlsZWROYW1lfT5gLFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS53YXJuKCdDb3VsZCBub3QgcmVsb2FkIHRoZSBhcHBsaWNhdGlvbiBhZnRlciBhbiBlZGl0LicpO1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICAvLyBDaGVjayB3aGV0aGVyIGFjY2Vzc2luZyBhbiBleHBvcnQgbWF5IGJlIHNpZGUtZWZmZWN0ZnVsXG4gIGNvbnN0IGlzRXhwb3J0U2FmZVRvQWNjZXNzID0gKFxuICAgIG1vZHVsZUV4cG9ydHM6IEV4cG9ydHMsXG4gICAga2V5OiBzdHJpbmcsXG4gICk6IGJvb2xlYW4gPT4ge1xuICAgIHJldHVybiAoXG4gICAgICAvLyBUcmFuc2Zvcm1lZCBFU00gc3ludGF4IHVzZXMgZ2V0dGVycyB0byBzdXBwb3J0IGxpdmUgYmluZGluZ3MgLSB3ZVxuICAgICAgLy8gY29uc2lkZXIgdGhvc2Ugc2FmZS4gRVNNIGl0c2VsZiBkb2VzIG5vdCBhbGxvdyB1c2VyLWRlZmluZWQgZ2V0dGVyc1xuICAgICAgLy8gb24gZXhwb3J0cy5cbiAgICAgIG1vZHVsZUV4cG9ydHM/Ll9fZXNNb2R1bGUgfHxcbiAgICAgIC8vIENvbW1vbkpTIG1vZHVsZXMgZXhwb3J0aW5nIGdldHRlcnMgbWF5IGhhdmUgc2lkZS1lZmZlY3RzLlxuICAgICAgT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihtb2R1bGVFeHBvcnRzLCBrZXkpPy5nZXQgPT0gbnVsbFxuICAgICk7XG4gIH07XG5cbiAgLy8gTW9kdWxlcyB0aGF0IG9ubHkgZXhwb3J0IGNvbXBvbmVudHMgYmVjb21lIFJlYWN0IFJlZnJlc2ggYm91bmRhcmllcy5cbiAgdmFyIGlzUmVhY3RSZWZyZXNoQm91bmRhcnkgPSBmdW5jdGlvbiAoXG4gICAgUmVmcmVzaDogYW55LFxuICAgIG1vZHVsZUV4cG9ydHM6IEV4cG9ydHMsXG4gICk6IGJvb2xlYW4ge1xuICAgIGlmIChSZWZyZXNoLmlzTGlrZWx5Q29tcG9uZW50VHlwZShtb2R1bGVFeHBvcnRzKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGlmIChtb2R1bGVFeHBvcnRzID09IG51bGwgfHwgdHlwZW9mIG1vZHVsZUV4cG9ydHMgIT09ICdvYmplY3QnKSB7XG4gICAgICAvLyBFeGl0IGlmIHdlIGNhbid0IGl0ZXJhdGUgb3ZlciBleHBvcnRzLlxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBsZXQgaGFzRXhwb3J0cyA9IGZhbHNlO1xuICAgIGxldCBhcmVBbGxFeHBvcnRzQ29tcG9uZW50cyA9IHRydWU7XG4gICAgZm9yIChjb25zdCBrZXkgaW4gbW9kdWxlRXhwb3J0cykge1xuICAgICAgaGFzRXhwb3J0cyA9IHRydWU7XG4gICAgICBpZiAoa2V5ID09PSAnX19lc01vZHVsZScpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9IGVsc2UgaWYgKCFpc0V4cG9ydFNhZmVUb0FjY2Vzcyhtb2R1bGVFeHBvcnRzLCBrZXkpKSB7XG4gICAgICAgIC8vIERvbid0IGludm9rZSBnZXR0ZXJzIGFzIHRoZXkgbWF5IGhhdmUgc2lkZSBlZmZlY3RzLlxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICBjb25zdCBleHBvcnRWYWx1ZSA9IG1vZHVsZUV4cG9ydHNba2V5XTtcbiAgICAgIGlmICghUmVmcmVzaC5pc0xpa2VseUNvbXBvbmVudFR5cGUoZXhwb3J0VmFsdWUpKSB7XG4gICAgICAgIGFyZUFsbEV4cG9ydHNDb21wb25lbnRzID0gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBoYXNFeHBvcnRzICYmIGFyZUFsbEV4cG9ydHNDb21wb25lbnRzO1xuICB9O1xuXG4gIHZhciBzaG91bGRJbnZhbGlkYXRlUmVhY3RSZWZyZXNoQm91bmRhcnkgPSAoXG4gICAgUmVmcmVzaDogYW55LFxuICAgIHByZXZFeHBvcnRzOiBFeHBvcnRzLFxuICAgIG5leHRFeHBvcnRzOiBFeHBvcnRzLFxuICApID0+IHtcbiAgICBjb25zdCBwcmV2U2lnbmF0dXJlID0gZ2V0UmVmcmVzaEJvdW5kYXJ5U2lnbmF0dXJlKFJlZnJlc2gsIHByZXZFeHBvcnRzKTtcbiAgICBjb25zdCBuZXh0U2lnbmF0dXJlID0gZ2V0UmVmcmVzaEJvdW5kYXJ5U2lnbmF0dXJlKFJlZnJlc2gsIG5leHRFeHBvcnRzKTtcbiAgICBpZiAocHJldlNpZ25hdHVyZS5sZW5ndGggIT09IG5leHRTaWduYXR1cmUubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBuZXh0U2lnbmF0dXJlLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAocHJldlNpZ25hdHVyZVtpXSAhPT0gbmV4dFNpZ25hdHVyZVtpXSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9O1xuXG4gIC8vIFdoZW4gdGhpcyBzaWduYXR1cmUgY2hhbmdlcywgaXQncyB1bnNhZmUgdG8gc3RvcCBhdCB0aGlzIHJlZnJlc2ggYm91bmRhcnkuXG4gIHZhciBnZXRSZWZyZXNoQm91bmRhcnlTaWduYXR1cmUgPSAoXG4gICAgUmVmcmVzaDogYW55LFxuICAgIG1vZHVsZUV4cG9ydHM6IEV4cG9ydHMsXG4gICk6IEFycmF5PG1peGVkPiA9PiB7XG4gICAgY29uc3Qgc2lnbmF0dXJlID0gW107XG4gICAgc2lnbmF0dXJlLnB1c2goUmVmcmVzaC5nZXRGYW1pbHlCeVR5cGUobW9kdWxlRXhwb3J0cykpO1xuICAgIGlmIChtb2R1bGVFeHBvcnRzID09IG51bGwgfHwgdHlwZW9mIG1vZHVsZUV4cG9ydHMgIT09ICdvYmplY3QnKSB7XG4gICAgICAvLyBFeGl0IGlmIHdlIGNhbid0IGl0ZXJhdGUgb3ZlciBleHBvcnRzLlxuICAgICAgLy8gKFRoaXMgaXMgaW1wb3J0YW50IGZvciBsZWdhY3kgZW52aXJvbm1lbnRzLilcbiAgICAgIHJldHVybiBzaWduYXR1cmU7XG4gICAgfVxuICAgIGZvciAoY29uc3Qga2V5IGluIG1vZHVsZUV4cG9ydHMpIHtcbiAgICAgIGlmIChrZXkgPT09ICdfX2VzTW9kdWxlJykge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH0gZWxzZSBpZiAoIWlzRXhwb3J0U2FmZVRvQWNjZXNzKG1vZHVsZUV4cG9ydHMsIGtleSkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBleHBvcnRWYWx1ZSA9IG1vZHVsZUV4cG9ydHNba2V5XTtcbiAgICAgIHNpZ25hdHVyZS5wdXNoKGtleSk7XG4gICAgICBzaWduYXR1cmUucHVzaChSZWZyZXNoLmdldEZhbWlseUJ5VHlwZShleHBvcnRWYWx1ZSkpO1xuICAgIH1cbiAgICByZXR1cm4gc2lnbmF0dXJlO1xuICB9O1xuXG4gIHZhciByZWdpc3RlckV4cG9ydHNGb3JSZWFjdFJlZnJlc2ggPSAoXG4gICAgUmVmcmVzaDogYW55LFxuICAgIG1vZHVsZUV4cG9ydHM6IEV4cG9ydHMsXG4gICAgbW9kdWxlSUQ6IHN0cmluZyxcbiAgKSA9PiB7XG4gICAgUmVmcmVzaC5yZWdpc3Rlcihtb2R1bGVFeHBvcnRzLCBtb2R1bGVJRCArICcgJWV4cG9ydHMlJyk7XG4gICAgaWYgKG1vZHVsZUV4cG9ydHMgPT0gbnVsbCB8fCB0eXBlb2YgbW9kdWxlRXhwb3J0cyAhPT0gJ29iamVjdCcpIHtcbiAgICAgIC8vIEV4aXQgaWYgd2UgY2FuJ3QgaXRlcmF0ZSBvdmVyIGV4cG9ydHMuXG4gICAgICAvLyAoVGhpcyBpcyBpbXBvcnRhbnQgZm9yIGxlZ2FjeSBlbnZpcm9ubWVudHMuKVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGtleSBpbiBtb2R1bGVFeHBvcnRzKSB7XG4gICAgICBpZiAoIWlzRXhwb3J0U2FmZVRvQWNjZXNzKG1vZHVsZUV4cG9ydHMsIGtleSkpIHtcbiAgICAgICAgLy8gRG9uJ3QgaW52b2tlIGdldHRlcnMgYXMgdGhleSBtYXkgaGF2ZSBzaWRlIGVmZmVjdHMuXG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZXhwb3J0VmFsdWUgPSBtb2R1bGVFeHBvcnRzW2tleV07XG4gICAgICBjb25zdCB0eXBlSUQgPSBtb2R1bGVJRCArICcgJWV4cG9ydHMlICcgKyBrZXk7XG4gICAgICBSZWZyZXNoLnJlZ2lzdGVyKGV4cG9ydFZhbHVlLCB0eXBlSUQpO1xuICAgIH1cbiAgfTtcblxuICBnbG9iYWwuX19hY2NlcHQgPSBtZXRyb0hvdFVwZGF0ZU1vZHVsZTtcbn1cblxuaWYgKF9fREVWX18pIHtcbiAgLy8gVGhlIG1ldHJvIHJlcXVpcmUgcG9seWZpbGwgY2FuIG5vdCBoYXZlIG1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gIC8vIFRoZSBTeXN0cmFjZSBhbmQgUmVhY3RSZWZyZXNoIGRlcGVuZGVuY2llcyBhcmUsIHRoZXJlZm9yZSwgbWFkZSBwdWJsaWNseVxuICAvLyBhdmFpbGFibGUuIElkZWFsbHksIHRoZSBkZXBlbmRlbmN5IHdvdWxkIGJlIGludmVyc2VkIGluIGEgd2F5IHRoYXRcbiAgLy8gU3lzdHJhY2UgLyBSZWFjdFJlZnJlc2ggY291bGQgaW50ZWdyYXRlIGludG8gTWV0cm8gcmF0aGVyIHRoYW5cbiAgLy8gaGF2aW5nIHRvIG1ha2UgdGhlbSBwdWJsaWNseSBhdmFpbGFibGUuXG5cbiAgdmFyIHJlcXVpcmVTeXN0cmFjZSA9IGZ1bmN0aW9uIHJlcXVpcmVTeXN0cmFjZSgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgLy8gJEZsb3dGaXhNZVtwcm9wLW1pc3NpbmddXG4gICAgICBnbG9iYWxbX19NRVRST19HTE9CQUxfUFJFRklYX18gKyAnX19TWVNUUkFDRSddIHx8IG1ldHJvUmVxdWlyZS5TeXN0cmFjZVxuICAgICk7XG4gIH07XG5cbiAgdmFyIHJlcXVpcmVSZWZyZXNoID0gZnVuY3Rpb24gcmVxdWlyZVJlZnJlc2goKSB7XG4gICAgLy8gX19NRVRST19HTE9CQUxfUFJFRklYX18gYW5kIGdsb2JhbC5fX01FVFJPX0dMT0JBTF9QUkVGSVhfXyBkaWZmZXIgZnJvbVxuICAgIC8vIGVhY2ggb3RoZXIgd2hlbiBtdWx0aXBsZSBtb2R1bGUgc3lzdGVtcyBhcmUgdXNlZCAtIGUuZywgaW4gdGhlIGNvbnRleHRcbiAgICAvLyBvZiBNb2R1bGUgRmVkZXJhdGlvbiwgdGhlIGZpcnN0IG9uZSB3b3VsZCByZWZlciB0byB0aGUgbG9jYWwgcHJlZml4XG4gICAgLy8gZGVmaW5lZCBhdCB0aGUgdG9wIG9mIHRoZSBidW5kbGUsIHdoaWxlIHRoZSBvdGhlciBhbHdheXMgcmVmZXJzIHRvIHRoZVxuICAgIC8vIG9uZSBjb21pbmcgZnJvbSB0aGUgSG9zdFxuICAgIHJldHVybiAoXG4gICAgICBnbG9iYWxbX19NRVRST19HTE9CQUxfUFJFRklYX18gKyAnX19SZWFjdFJlZnJlc2gnXSB8fFxuICAgICAgZ2xvYmFsW2dsb2JhbC5fX01FVFJPX0dMT0JBTF9QUkVGSVhfXyArICdfX1JlYWN0UmVmcmVzaCddIHx8XG4gICAgICAvLyAkRmxvd0ZpeE1lW3Byb3AtbWlzc2luZ11cbiAgICAgIG1ldHJvUmVxdWlyZS5SZWZyZXNoXG4gICAgKTtcbiAgfTtcbn1cbiIsImZ1bmN0aW9uIGZvbygpIHtcbiAgJ3dvcmtsZXQnO1xuXG4gIGZ1bmN0aW9uIGJhcigpIHtcbiAgICAnd29ya2xldCc7XG5cbiAgICBmdW5jdGlvbiBiYXooKSB7XG4gICAgICAnd29ya2xldCc7XG4gICAgICByZXR1cm4gMTtcbiAgICB9XG5cbiAgICByZXR1cm4gYmF6KCkgKyAxO1xuXG4gIH1cblxuICByZXR1cm4gYmFyKCkgKyAxO1xufVxuXG5mb28oKTtcbiIsIiIsIiIsIiJdLCJ4X2ZhY2Vib29rX3NvdXJjZXMiOltudWxsLFt7Im5hbWVzIjpbIjxnbG9iYWw+IiwiPGFub255bW91cz4iLCJjbGVhciIsImdldE1vZHVsZUlkRm9yVmVyYm9zZU5hbWUiLCJkZWZpbmUiLCJtZXRyb1JlcXVpcmUiLCJpbml0aWFsaXppbmdNb2R1bGVJZHMuc2xpY2UubWFwJGFyZ3VtZW50XzAiLCJzaG91bGRQcmludFJlcXVpcmVDeWNsZSIsImlzSWdub3JlZCIsInJlZ0V4cHMuc29tZSRhcmd1bWVudF8wIiwibW9kdWxlcy5ldmVyeSRhcmd1bWVudF8wIiwibWV0cm9JbXBvcnREZWZhdWx0IiwibWV0cm9JbXBvcnRBbGwiLCJmYWxsYmFja1JlcXVpcmVDb250ZXh0IiwiZmFsbGJhY2tSZXF1aXJlUmVzb2x2ZVdlYWsiLCJndWFyZGVkTG9hZE1vZHVsZSIsInVucGFja01vZHVsZUlkIiwicGFja01vZHVsZUlkIiwicmVnaXN0ZXJTZWdtZW50IiwibW9kdWxlSWRzLmZvckVhY2gkYXJndW1lbnRfMCIsImxvYWRNb2R1bGVJbXBsZW1lbnRhdGlvbiIsImdsb2JhbC4kUmVmcmVzaFJlZyQiLCJ1bmtub3duTW9kdWxlRXJyb3IiLCJtZXRyb1JlcXVpcmUuU3lzdHJhY2UuYmVnaW5FdmVudCIsIm1ldHJvUmVxdWlyZS5TeXN0cmFjZS5lbmRFdmVudCIsIm1ldHJvUmVxdWlyZS5nZXRNb2R1bGVzIiwiY3JlYXRlSG90UmVsb2FkaW5nT2JqZWN0IiwiaG90LmFjY2VwdCIsImhvdC5kaXNwb3NlIiwibWV0cm9Ib3RVcGRhdGVNb2R1bGUiLCJ0b3BvbG9naWNhbFNvcnQkYXJndW1lbnRfMSIsInRvcG9sb2dpY2FsU29ydCRhcmd1bWVudF8yIiwic2V0VGltZW91dCRhcmd1bWVudF8wIiwidG9wb2xvZ2ljYWxTb3J0IiwidHJhdmVyc2VEZXBlbmRlbnROb2RlcyIsImRlcGVuZGVudE5vZGVzLmZvckVhY2gkYXJndW1lbnRfMCIsInJvb3RzLmZvckVhY2gkYXJndW1lbnRfMCIsInJ1blVwZGF0ZWRNb2R1bGUiLCJwZXJmb3JtRnVsbFJlZnJlc2giLCJpc0V4cG9ydFNhZmVUb0FjY2VzcyIsImlzUmVhY3RSZWZyZXNoQm91bmRhcnkiLCJzaG91bGRJbnZhbGlkYXRlUmVhY3RSZWZyZXNoQm91bmRhcnkiLCJnZXRSZWZyZXNoQm91bmRhcnlTaWduYXR1cmUiLCJyZWdpc3RlckV4cG9ydHNGb3JSZWFjdFJlZnJlc2giLCJyZXF1aXJlU3lzdHJhY2UiLCJyZXF1aXJlUmVmcmVzaCJdLCJtYXBwaW5ncyI6IkFBQTtnRENnRyxRRDtnRENDLGtCRDtBRUc7Q0ZPO2tDR0k7R0hNO0FJSTtDSmdEO0FLRTthQ2dDLDJERDtDTGlCO0FPSTtvQkNPO21DQ0MsNkJELENEO3VCR0csNEJIO0NQQztBV0U7Q1g2QjtBWUc7Q1owQzt1QmFNO0NiUzsyQmNHO0NkTztBZUc7Q2ZrQjtBZ0JLO0NoQlE7QWlCRztDakJNO0FrQk07c0JDb0I7S0RJO0NsQkU7QW9CRTs4QkMwRDtTREs7Q3BCNEQ7QXNCRTtDdEJRO2dCdUJLLGN2Qjtjd0JDLGN4Qjs0QnlCRztHekJFO2lDMEJHO2NDSztPREc7ZUVDO09GRTtHMUJHOytCNkJJO1FDa0Q7U0Q2QztRRUMsZ0JGO3lDRytHO1NISTtHN0JHOzBCaUNFO0lDUTs2QkNjO09ERTtLREc7a0JHQztLSEU7R2pDRTsyQnFDRTtHckN1RTs2QnNDRTtHdEMyQjsrQnVDRztHdkNZOytCd0NHO0d4QzJCOzZDeUNFO0d6Q2dCO29DMENHO0cxQ3NCO3VDMkNFO0czQ29CO3dCNENZO0c1Q0s7dUI2Q0U7RzdDWSJ9XSxbeyJuYW1lcyI6WyJmb28iLCJiYXIiLCJiYXoiLCI8Z2xvYmFsPiJdLCJtYXBwaW5ncyI6IkFBQTtFQ0c7SUNHO0tERztHREk7Q0dHIn1dLFt7Im5hbWVzIjpbIjxnbG9iYWw+IiwiZm9vX2ZpbGVKczNGYWN0b3J5IiwiZm9vIl0sIm1hcHBpbmdzIjoiQUFBLGdCQztjQ0U7R0RHO0NETSJ9XSxbeyJuYW1lcyI6WyI8Z2xvYmFsPiIsImJhcl9maWxlSnMyRmFjdG9yeSIsImJhciJdLCJtYXBwaW5ncyI6IkFBQSxnQkM7Y0NFO0dERztDRE0ifV0sW3sibmFtZXMiOlsiPGdsb2JhbD4iLCJiYXpfZmlsZUpzMUZhY3RvcnkiLCJiYXoiXSwibWFwcGluZ3MiOiJBQUEsZ0JDO2NDRTtHREU7Q0RNIn1dXSwieF9nb29nbGVfaWdub3JlTGlzdCI6WzAsMyw0LDVdLCJuYW1lcyI6WyJnbG9iYWwiLCJfX3IiLCJtZXRyb1JlcXVpcmUiLCJfX01FVFJPX0dMT0JBTF9QUkVGSVhfXyIsImRlZmluZSIsIl9fYyIsImNsZWFyIiwiX19yZWdpc3RlclNlZ21lbnQiLCJyZWdpc3RlclNlZ21lbnQiLCJtb2R1bGVzIiwiRU1QVFkiLCJDWUNMRV9ERVRFQ1RFRCIsImhhc093blByb3BlcnR5IiwiX19ERVZfXyIsIiRSZWZyZXNoUmVnJCIsIiRSZWZyZXNoU2lnJCIsInR5cGUiLCJNYXAiLCJ2ZXJib3NlTmFtZXNUb01vZHVsZUlkcyIsImdldE1vZHVsZUlkRm9yVmVyYm9zZU5hbWUiLCJ2ZXJib3NlTmFtZSIsIm1vZHVsZUlkIiwiZ2V0IiwiRXJyb3IiLCJpbml0aWFsaXppbmdNb2R1bGVJZHMiLCJmYWN0b3J5IiwiZGVwZW5kZW5jeU1hcCIsImhhcyIsImludmVyc2VEZXBlbmRlbmNpZXMiLCJhcmd1bWVudHMiLCJfX2FjY2VwdCIsIm1vZCIsImhhc0Vycm9yIiwiaW1wb3J0ZWRBbGwiLCJpbXBvcnRlZERlZmF1bHQiLCJpc0luaXRpYWxpemVkIiwicHVibGljTW9kdWxlIiwiZXhwb3J0cyIsInNldCIsImhvdCIsImNyZWF0ZUhvdFJlbG9hZGluZ09iamVjdCIsIm1heWJlTmFtZUZvckRldiIsImNvbnNvbGUiLCJ3YXJuIiwibW9kdWxlSWRSZWFsbHlJc051bWJlciIsImluaXRpYWxpemluZ0luZGV4IiwiaW5kZXhPZiIsImN5Y2xlIiwic2xpY2UiLCJtYXAiLCJpZCIsInNob3VsZFByaW50UmVxdWlyZUN5Y2xlIiwicHVzaCIsImpvaW4iLCJtb2R1bGUiLCJndWFyZGVkTG9hZE1vZHVsZSIsInJlZ0V4cHMiLCJBcnJheSIsImlzQXJyYXkiLCJpc0lnbm9yZWQiLCJzb21lIiwicmVnRXhwIiwidGVzdCIsImV2ZXJ5IiwibWV0cm9JbXBvcnREZWZhdWx0IiwibWF5YmVJbml0aWFsaXplZE1vZHVsZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiaW5pdGlhbGl6ZWRNb2R1bGUiLCJpbXBvcnREZWZhdWx0IiwibWV0cm9JbXBvcnRBbGwiLCJrZXkiLCJjYWxsIiwiaW1wb3J0QWxsIiwiY29udGV4dCIsImZhbGxiYWNrUmVxdWlyZUNvbnRleHQiLCJyZXNvbHZlV2VhayIsImZhbGxiYWNrUmVxdWlyZVJlc29sdmVXZWFrIiwiaW5HdWFyZCIsIkVycm9yVXRpbHMiLCJyZXR1cm5WYWx1ZSIsImxvYWRNb2R1bGVJbXBsZW1lbnRhdGlvbiIsImUiLCJyZXBvcnRGYXRhbEVycm9yIiwiSURfTUFTS19TSElGVCIsIkxPQ0FMX0lEX01BU0siLCJ1bnBhY2tNb2R1bGVJZCIsInNlZ21lbnRJZCIsImxvY2FsSWQiLCJwYWNrTW9kdWxlSWQiLCJ2YWx1ZSIsIm1vZHVsZURlZmluZXJzQnlTZWdtZW50SUQiLCJkZWZpbmluZ1NlZ21lbnRCeU1vZHVsZUlEIiwibW9kdWxlRGVmaW5lciIsIm1vZHVsZUlkcyIsImZvckVhY2giLCJsZW5ndGgiLCJkZWZpbmVyIiwiZGVsZXRlIiwibmF0aXZlUmVxdWlyZSIsInVua25vd25Nb2R1bGVFcnJvciIsImVycm9yIiwiU3lzdHJhY2UiLCJyZXF1aXJlU3lzdHJhY2UiLCJSZWZyZXNoIiwicmVxdWlyZVJlZnJlc2giLCJiZWdpbkV2ZW50IiwibW9kdWxlT2JqZWN0IiwicHJldlJlZnJlc2hSZWciLCJwcmV2UmVmcmVzaFNpZyIsIlJlZnJlc2hSdW50aW1lIiwicHJlZml4ZWRNb2R1bGVJZCIsInJlZ2lzdGVyIiwiY3JlYXRlU2lnbmF0dXJlRnVuY3Rpb25Gb3JUcmFuc2Zvcm0iLCJ1bmRlZmluZWQiLCJlbmRFdmVudCIsInJlZ2lzdGVyRXhwb3J0c0ZvclJlYWN0UmVmcmVzaCIsInBvcCIsIm1lc3NhZ2UiLCJnZXRNb2R1bGVzIiwiX2FjY2VwdENhbGxiYWNrIiwiX2Rpc3Bvc2VDYWxsYmFjayIsIl9kaWRBY2NlcHQiLCJhY2NlcHQiLCJjYWxsYmFjayIsImRpc3Bvc2UiLCJyZWFjdFJlZnJlc2hUaW1lb3V0IiwibWV0cm9Ib3RVcGRhdGVNb2R1bGUiLCJyZWZyZXNoQm91bmRhcnlJRHMiLCJTZXQiLCJkaWRCYWlsT3V0IiwidXBkYXRlZE1vZHVsZUlEcyIsInRvcG9sb2dpY2FsU29ydCIsInBlbmRpbmdJRCIsInBlbmRpbmdNb2R1bGUiLCJwZW5kaW5nSG90IiwiY2FuQWNjZXB0IiwiaXNCb3VuZGFyeSIsImlzUmVhY3RSZWZyZXNoQm91bmRhcnkiLCJhZGQiLCJwYXJlbnRJRHMiLCJwZXJmb3JtRnVsbFJlZnJlc2giLCJzb3VyY2UiLCJmYWlsZWQiLCJyZXZlcnNlIiwic2Vlbk1vZHVsZUlEcyIsImkiLCJ1cGRhdGVkSUQiLCJ1cGRhdGVkTW9kIiwicHJldkV4cG9ydHMiLCJkaWRFcnJvciIsInJ1blVwZGF0ZWRNb2R1bGUiLCJuZXh0RXhwb3J0cyIsImlzTm9Mb25nZXJBQm91bmRhcnkiLCJkaWRJbnZhbGlkYXRlIiwic2hvdWxkSW52YWxpZGF0ZVJlYWN0UmVmcmVzaEJvdW5kYXJ5IiwiaiIsInBhcmVudElEIiwicGFyZW50TW9kIiwiY2FuQWNjZXB0UGFyZW50Iiwic2V0VGltZW91dCIsInBlcmZvcm1SZWFjdFJlZnJlc2giLCJyb290cyIsImdldEVkZ2VzIiwiZWFybHlTdG9wIiwicmVzdWx0IiwidmlzaXRlZCIsInN0YWNrIiwidHJhdmVyc2VEZXBlbmRlbnROb2RlcyIsIm5vZGUiLCJkZXBlbmRlbnROb2RlcyIsImRlcGVuZGVudCIsInJvb3QiLCJyZWFzb24iLCJ3aW5kb3ciLCJsb2NhdGlvbiIsInJlbG9hZCIsInNvdXJjZU5hbWUiLCJmYWlsZWROYW1lIiwiaXNFeHBvcnRTYWZlVG9BY2Nlc3MiLCJtb2R1bGVFeHBvcnRzIiwiT2JqZWN0IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwiaXNMaWtlbHlDb21wb25lbnRUeXBlIiwiaGFzRXhwb3J0cyIsImFyZUFsbEV4cG9ydHNDb21wb25lbnRzIiwiZXhwb3J0VmFsdWUiLCJwcmV2U2lnbmF0dXJlIiwiZ2V0UmVmcmVzaEJvdW5kYXJ5U2lnbmF0dXJlIiwibmV4dFNpZ25hdHVyZSIsInNpZ25hdHVyZSIsImdldEZhbWlseUJ5VHlwZSIsIm1vZHVsZUlEIiwidHlwZUlEIiwiZ2xvYmFsVGhpcyIsIl8kJF9SRVFVSVJFIiwiX2RlcGVuZGVuY3lNYXAiLCJmb28iLCJmb29fZmlsZUpzM0ZhY3RvcnkiLCJfZSIsImJhciIsInJlcXVpcmUiLCJfX2Nsb3N1cmUiLCJfX3dvcmtsZXRIYXNoIiwiX19wbHVnaW5WZXJzaW9uIiwiX19zdGFja0RldGFpbHMiLCJiYXJfZmlsZUpzMkZhY3RvcnkiLCJiYXoiLCJiYXpfZmlsZUpzMUZhY3RvcnkiXSwibWFwcGluZ3MiOiI7O0VDWUEsWUFBWTs7RUFzRVpBLE1BQU0sQ0FBQ0MsR0FBRyxHQUFHQyxZQUF5QjtFQUN0Q0YsTUFBTSxDQUFDLEdBQUdHLHVCQUF1QixLQUFLLENBQUMsR0FBR0MsTUFBa0I7RUFDNURKLE1BQU0sQ0FBQ0ssR0FBRyxHQUFHQyxLQUFLO0VBQ2xCTixNQUFNLENBQUNPLGlCQUFpQixHQUFHQyxlQUFlO0VBRTFDLElBQUlDLE9BQU8sR0FBR0gsS0FBSyxDQUFDLENBQUM7RUFJckIsTUFBTUksS0FBSyxHQUFHLENBQUMsQ0FBQztFQUNoQixNQUFNQyxjQUFjLEdBQUcsQ0FBQyxDQUFDO0VBQ3pCLE1BQU07SUFBQ0M7RUFBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0VBRTNCLElBQUlDLE9BQU8sRUFBRTtJQUNYYixNQUFNLENBQUNjLFlBQVksR0FBR2QsTUFBTSxDQUFDYyxZQUFZLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQztJQUN2RGQsTUFBTSxDQUFDZSxZQUFZLEdBQUdmLE1BQU0sQ0FBQ2UsWUFBWSxLQUFLLE1BQU1DLElBQUksSUFBSUEsSUFBSSxDQUFDO0VBQ25FO0VBRUEsU0FBU1YsS0FBS0EsQ0FBQSxFQUFlO0lBQzNCRyxPQUFPLEdBQUcsSUFBSVEsR0FBRyxDQUFDLENBQUM7SUFLbkIsT0FBT1IsT0FBTztFQUNoQjtFQUVBLElBQUlJLE9BQU8sRUFBRTtJQUNYLElBQUlLLHVCQUE0QyxHQUFHLElBQUlELEdBQUcsQ0FBQyxDQUFDO0lBQzVELElBQUlFLHlCQUF5QixHQUFJQyxXQUFtQixJQUFhO01BQy9ELE1BQU1DLFFBQVEsR0FBR0gsdUJBQXVCLENBQUNJLEdBQUcsQ0FB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