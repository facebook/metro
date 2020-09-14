/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

'use strict';

const nullthrows = require('nullthrows');

const generate = require('@babel/generator').default;
const template = require('@babel/template').default;
const traverse = require('@babel/traverse').default;
const types = require('@babel/types');

import type {Ast} from '@babel/core';
import type {Path} from '@babel/traverse';
import type {
  AllowOptionalDependencies,
  AsyncDependencyType,
} from 'metro/src/DeltaBundler/types.flow.js';

opaque type Identifier = any;

type ImportDependencyOptions = $ReadOnly<{
  asyncType: AsyncDependencyType,
  jsResource?: boolean,
  splitCondition?: Path,
}>;

type Dependency<TSplitCondition> = $ReadOnly<{
  data: DependencyData<TSplitCondition>,
  name: string,
}>;

type DependencyData<TSplitCondition> = $ReadOnly<{
  // If null, then the dependency is synchronous.
  // (ex. `require('foo')`)
  asyncType: AsyncDependencyType | null,
  isOptional?: boolean,
  // If left unspecified, then the dependency is unconditionally split.
  splitCondition?: TSplitCondition,
  locs: Array<BabelSourceLocation>,
}>;

type InternalDependency<TSplitCondition> = $ReadOnly<{
  ...Dependency<TSplitCondition>,
  data: InternalDependencyData<TSplitCondition>,
}>;

type MutableInternalDependencyData<TSplitCondition> = {
  ...DependencyData<TSplitCondition>,
  index: number,
  name: string,
};

type InternalDependencyData<TSplitCondition> = $ReadOnly<
  MutableInternalDependencyData<TSplitCondition>,
>;

type State<TSplitCondition> = {
  asyncRequireModulePathStringLiteral: ?Identifier,
  dependencyCalls: Set<string>,
  dependencyRegistry: ModuleDependencyRegistry<TSplitCondition>,
  dynamicRequires: DynamicRequiresBehavior,
  dependencyMapIdentifier: ?Identifier,
  keepRequireNames: boolean,
  disableRequiresTransform: boolean,
  allowOptionalDependencies: AllowOptionalDependencies,
};

export type Options = $ReadOnly<{
  asyncRequireModulePath: string,
  dependencyMapName?: string,
  dynamicRequires: DynamicRequiresBehavior,
  inlineableCalls: $ReadOnlyArray<string>,
  keepRequireNames: boolean,
  disableRequiresTransform?: boolean,
  allowOptionalDependencies: AllowOptionalDependencies,
}>;

type CollectedDependencies<TSplitCondition> = $ReadOnly<{
  ast: Ast,
  dependencyMapName: string,
  dependencies: $ReadOnlyArray<Dependency<TSplitCondition>>,
}>;

// Registry for the dependency of a module.
// Defines when dependencies should be collapsed.
// E.g. should a module that's once required optinally and once not
// be tretaed as the smae or different dependencies.
interface ModuleDependencyRegistry<TSplitCondition> {
  registerDependency(
    qualifier: ImportQualifier,
  ): InternalDependencyData<TSplitCondition>;
  getDependencies(): Array<InternalDependencyData<TSplitCondition>>;
}

export type DynamicRequiresBehavior = 'throwAtRuntime' | 'reject';

/**
 * Produces a Babel template that will throw at runtime when the require call
 * is reached. This makes dynamic require errors catchable by libraries that
 * want to use them.
 */
const dynamicRequireErrorTemplate = template(`
  (function(line) {
    throw new Error(
      'Dynamic require defined at line ' + line + '; not supported by Metro',
    );
  })(LINE)
`);

/**
 * Produces a Babel template that transforms an "import(...)" call into a
 * "require(...)" call to the asyncRequire specified.
 */
const makeAsyncRequireTemplate = template(`
  require(ASYNC_REQUIRE_MODULE_PATH)(MODULE_ID, MODULE_NAME)
`);

const makeAsyncPrefetchTemplate = template(`
  require(ASYNC_REQUIRE_MODULE_PATH).prefetch(MODULE_ID, MODULE_NAME)
`);

const makeJSResourceTemplate = template(`
  require(ASYNC_REQUIRE_MODULE_PATH).resource(MODULE_ID, MODULE_NAME)
`);

/**
 * Transform all the calls to `require()` and `import()` in a file into ID-
 * independent code, and return the list of dependencies. For example, a call
 * like `require('Foo')` could be transformed to `require(_depMap[3], 'Foo')`
 * where `_depMap` is provided by the outer scope. As such, we don't need to
 * know the actual module ID.
 *
 * The second argument is only provided for debugging purposes.
 */
function collectDependencies(
  ast: Ast,
  options: Options,
): CollectedDependencies<void> {
  const visited = new WeakSet();

  const state: State<void> = {
    asyncRequireModulePathStringLiteral: null,
    dependencyCalls: new Set(),
    dependencyRegistry: new DefaultModuleDependencyRegistry(),
    dependencyMapIdentifier: null,
    dynamicRequires: options.dynamicRequires,
    keepRequireNames: options.keepRequireNames,
    disableRequiresTransform: !!options.disableRequiresTransform,
    allowOptionalDependencies: options.allowOptionalDependencies,
  };

  const visitor = {
    CallExpression(path: Path, state: State<void>) {
      if (visited.has(path.node)) {
        return;
      }

      const callee = path.get('callee');
      const name = callee.node.name;

      if (callee.isImport()) {
        processImportCall(path, state, {
          asyncType: 'async',
        });
        return;
      }

      if (name === '__prefetchImport' && !path.scope.getBinding(name)) {
        processImportCall(path, state, {
          asyncType: 'prefetch',
        });
        return;
      }

      if (name === '__jsResource' && !path.scope.getBinding(name)) {
        processImportCall(path, state, {
          asyncType: 'async',
          jsResource: true,
        });
        return;
      }

      if (
        name === '__conditionallySplitJSResource' &&
        !path.scope.getBinding(name)
      ) {
        processImportCall(path, state, {
          asyncType: 'async',
          jsResource: true,
          splitCondition: path.get('arguments')[1],
        });
        return;
      }

      if (state.dependencyCalls.has(name) && !path.scope.getBinding(name)) {
        visited.add(processRequireCall(path, state).node);
      }
    },

    ImportDeclaration: collectImports,
    ExportNamedDeclaration: collectImports,
    ExportAllDeclaration: collectImports,

    Program(path: Path, state: State<void>) {
      state.asyncRequireModulePathStringLiteral = types.stringLiteral(
        options.asyncRequireModulePath,
      );

      if (options.dependencyMapName != null) {
        state.dependencyMapIdentifier = types.identifier(
          options.dependencyMapName,
        );
      } else {
        state.dependencyMapIdentifier = path.scope.generateUidIdentifier(
          'dependencyMap',
        );
      }

      state.dependencyCalls = new Set(['require', ...options.inlineableCalls]);
    },
  };

  traverse(ast, visitor, null, state);

  const collectedDependencies = state.dependencyRegistry.getDependencies();
  // Compute the list of dependencies.
  const dependencies = new Array(collectedDependencies.length);

  for (const {index, name, ...dependencyData} of collectedDependencies) {
    dependencies[index] = {
      name,
      data: dependencyData,
    };
  }

  return {
    ast,
    dependencies,
    dependencyMapName: nullthrows(state.dependencyMapIdentifier).name,
  };
}

function collectImports<TSplitCondition>(
  path: Path,
  state: State<TSplitCondition>,
) {
  if (path.node.source) {
    registerDependency(
      state,
      {
        name: path.node.source.value,
        asyncType: null,
        optional: false,
      },
      path,
    );
  }
}

function processImportCall<TSplitCondition>(
  path: Path,
  state: State<TSplitCondition>,
  options: ImportDependencyOptions,
): Path {
  const name = getModuleNameFromCallArgs(path);

  if (name == null) {
    throw new InvalidRequireCallError(path);
  }

  const dep = registerDependency(
    state,
    {
      name,
      asyncType: options.asyncType,
      splitCondition: options.splitCondition,
      optional: isOptionalDependency(name, path, state),
    },
    path,
  );

  if (state.disableRequiresTransform) {
    return path;
  }

  const ASYNC_REQUIRE_MODULE_PATH = state.asyncRequireModulePathStringLiteral;
  const MODULE_ID = types.memberExpression(
    state.dependencyMapIdentifier,
    types.numericLiteral(dep.data.index),
    true,
  );
  const MODULE_NAME = types.stringLiteral(name);

  if (options.jsResource) {
    path.replaceWith(
      makeJSResourceTemplate({
        ASYNC_REQUIRE_MODULE_PATH,
        MODULE_ID,
        MODULE_NAME,
      }),
    );
  } else if (options.asyncType === 'async') {
    path.replaceWith(
      makeAsyncRequireTemplate({
        ASYNC_REQUIRE_MODULE_PATH,
        MODULE_ID,
        MODULE_NAME,
      }),
    );
  } else {
    path.replaceWith(
      makeAsyncPrefetchTemplate({
        ASYNC_REQUIRE_MODULE_PATH,
        MODULE_ID,
        MODULE_NAME,
      }),
    );
  }

  return path;
}

function processRequireCall<TSplitCondition>(
  path: Path,
  state: State<TSplitCondition>,
): Path {
  const name = getModuleNameFromCallArgs(path);

  if (name == null) {
    if (state.dynamicRequires === 'reject') {
      throw new InvalidRequireCallError(path);
    }

    path.replaceWith(
      dynamicRequireErrorTemplate({
        LINE: '' + path.node.loc.start.line,
      }),
    );
    return path;
  }

  const dep = registerDependency(
    state,
    {
      name,
      asyncType: null,
      optional: isOptionalDependency(name, path, state),
    },
    path,
  );

  if (state.disableRequiresTransform) {
    return path;
  }

  const moduleIDExpression = types.memberExpression(
    state.dependencyMapIdentifier,
    types.numericLiteral(dep.data.index),
    true,
  );

  path.node.arguments = state.keepRequireNames
    ? [moduleIDExpression, types.stringLiteral(name)]
    : [moduleIDExpression];

  return path;
}

function getNearestLocFromPath(path: Path): ?BabelSourceLocation {
  while (path && !path.node.loc) {
    path = path.parentPath;
  }
  return path?.node.loc;
}

type ImportQualifier = $ReadOnly<{
  name: string,
  asyncType: AsyncDependencyType | null,
  splitCondition?: Path,
  optional: boolean,
}>;

function registerDependency<TSplitCondition>(
  state: State<TSplitCondition>,
  qualifier: ImportQualifier,
  path: Path,
): InternalDependency<TSplitCondition> {
  const dependencyData = state.dependencyRegistry.registerDependency(qualifier);

  const loc = getNearestLocFromPath(path);
  if (loc != null) {
    dependencyData.locs.push(loc);
  }

  return {name: qualifier.name, data: dependencyData};
}

function isOptionalDependency<TSplitCondition>(
  name: string,
  path: Path,
  state: State<TSplitCondition>,
): boolean {
  const {allowOptionalDependencies} = state;

  // The async require module is a 'built-in'. Resolving should never fail -> treat it as non-optional.
  if (name === state.asyncRequireModulePathStringLiteral?.name) {
    return false;
  }

  const isExcluded = () =>
    Array.isArray(allowOptionalDependencies.exclude) &&
    allowOptionalDependencies.exclude.includes(name);

  if (!allowOptionalDependencies || isExcluded()) {
    return false;
  }

  // Valid statement stack for single-level try-block: expressionStatement -> blockStatement -> tryStatement
  let sCount = 0;
  let p = path;
  while (p && sCount < 3) {
    if (p.isStatement()) {
      if (p.node.type === 'BlockStatement') {
        // A single-level should have the tryStatement immediately followed BlockStatement
        // with the key 'block' to distinguish from the finally block, which has key = 'finalizer'
        return p.parentPath.node.type === 'TryStatement' && p.key === 'block';
      }
      sCount += 1;
    }
    p = p.parentPath;
  }

  return false;
}

function getModuleNameFromCallArgs(path: Path): ?string {
  const expectedCount =
    path.node.callee.name === '__conditionallySplitJSResource' ? 2 : 1;
  if (path.get('arguments').length !== expectedCount) {
    throw new InvalidRequireCallError(path);
  }

  const result = path.get('arguments.0').evaluate();

  if (result.confident && typeof result.value === 'string') {
    return result.value;
  }

  return null;
}
collectDependencies.getModuleNameFromCallArgs = getModuleNameFromCallArgs;

class InvalidRequireCallError extends Error {
  constructor({node}: any) {
    const line = node.loc && node.loc.start && node.loc.start.line;

    super(
      `Invalid call at line ${line || '<unknown>'}: ${generate(node).code}`,
    );
  }
}

collectDependencies.InvalidRequireCallError = InvalidRequireCallError;

class DefaultModuleDependencyRegistry
  implements ModuleDependencyRegistry<void> {
  _dependencies = new Map<string, InternalDependencyData<void>>();

  registerDependency(qualifier: ImportQualifier): InternalDependencyData<void> {
    let dependencyData: ?InternalDependencyData<void> = this._dependencies.get(
      qualifier.name,
    );

    if (dependencyData == null) {
      const newDependencyData: MutableInternalDependencyData<void> = {
        name: qualifier.name,
        asyncType: qualifier.asyncType,
        locs: [],
        index: this._dependencies.size,
      };

      if (qualifier.optional) {
        newDependencyData.isOptional = true;
      }

      dependencyData = newDependencyData;
      this._dependencies.set(qualifier.name, newDependencyData);
    } else {
      const original = dependencyData;
      dependencyData = collapseDependencies(original, qualifier);
      if (original !== dependencyData) {
        this._dependencies.set(qualifier.name, dependencyData);
      }
    }

    return dependencyData;
  }

  getDependencies(): Array<InternalDependencyData<void>> {
    return Array.from(this._dependencies.values());
  }
}

function collapseDependencies(
  dependency: InternalDependencyData<void>,
  qualifier: ImportQualifier,
): InternalDependencyData<void> {
  let collapsed = dependency;

  // A previously optionally required dependency was required non-optionaly.
  // Mark it non optional for the whole module
  if (collapsed.isOptional && !qualifier.optional) {
    collapsed = {
      ...dependency,
      isOptional: false,
    };
  }

  // A previously asynchronously (or prefetch) required module was required synchronously.
  // Make the dependency sync.
  if (collapsed.asyncType != null && qualifier.asyncType == null) {
    collapsed = {...dependency, asyncType: null};
  }

  // A prefetched dependency was required async in the module. Mark it as async.
  if (collapsed.asyncType === 'prefetch' && qualifier.asyncType === 'async') {
    collapsed = {
      ...dependency,
      asyncType: 'async',
    };
  }

  return collapsed;
}

module.exports = collectDependencies;
