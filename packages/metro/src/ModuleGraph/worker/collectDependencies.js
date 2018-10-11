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

opaque type Identifier = any;
opaque type Path = any;

type InternalDependency<D> = {|
  +data: D,
  +name: string,
|};

type InternalDependencyData = {|
  isAsync: boolean,
|};

type InternalDependencyInfo = {|
  data: InternalDependencyData,
  index: number,
|};

type State = {|
  asyncRequireModulePathStringLiteral: ?Identifier,
  dependency: number,
  dependencyCalls: Set<string>,
  dependencyData: Map<string, InternalDependencyData>,
  dependencyIndexes: Map<string, number>,
  dynamicRequires: DynamicRequiresBehavior,
  dependencyMapIdentifier: ?Identifier,
  keepRequireNames: boolean,
|};

export type Options = {|
  +asyncRequireModulePath: string,
  +dynamicRequires: DynamicRequiresBehavior,
  +inlineableCalls: $ReadOnlyArray<string>,
  +keepRequireNames: boolean,
|};

export type CollectedDependencies = {|
  +dependencyMapName: string,
  +dependencies: $ReadOnlyArray<Dependency>,
|};

export type DependencyData = $ReadOnly<InternalDependencyData>;

export type Dependency = InternalDependency<DependencyData>;

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
  require(ASYNC_REQUIRE_MODULE_PATH)(MODULE_ID)
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
): CollectedDependencies {
  const visited = new WeakSet();

  const state: State = {
    asyncRequireModulePathStringLiteral: null,
    dependency: 0,
    dependencyCalls: new Set(),
    dependencyData: new Map(),
    dependencyIndexes: new Map(),
    dependencyMapIdentifier: null,
    dynamicRequires: options.dynamicRequires,
    keepRequireNames: options.keepRequireNames,
  };

  const visitor = {
    CallExpression(path: Path, state: State) {
      if (visited.has(path.node)) {
        return;
      }

      const callee = path.get('callee');
      const name = callee.node.name;

      if (callee.isImport()) {
        processImportCall(path, state);
      }

      if (state.dependencyCalls.has(name) && !path.scope.getBinding(name)) {
        visited.add(processRequireCall(path, state).node);
      }
    },

    Program(path: Path, state: State) {
      state.asyncRequireModulePathStringLiteral = types.stringLiteral(
        options.asyncRequireModulePath,
      );

      state.dependencyMapIdentifier = path.scope.generateUidIdentifier(
        'dependencyMap',
      );

      state.dependencyCalls = new Set(['require', ...options.inlineableCalls]);
    },
  };

  traverse(ast, visitor, null, state);

  // Compute the list of dependencies.
  const dependencies = new Array(state.dependency);

  for (const [name, data] of state.dependencyData) {
    dependencies[nullthrows(state.dependencyIndexes.get(name))] = {name, data};
  }

  return {
    dependencies,
    dependencyMapName: nullthrows(state.dependencyMapIdentifier).name,
  };
}

function processImportCall(path: Path, state: State): Path {
  const name = getModuleNameFromCallArgs(path);

  if (name == null) {
    throw new InvalidRequireCallError(path);
  }

  path.replaceWith(
    makeAsyncRequireTemplate({
      ASYNC_REQUIRE_MODULE_PATH: state.asyncRequireModulePathStringLiteral,
      MODULE_ID: createDependencyMapLookup(state, name),
    }),
  );

  return path;
}

function processRequireCall(path: Path, state: State): Path {
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
  } else {
    getDependency(state, name).data.isAsync = false;
    path.node.arguments = createDependencyMapLookup(state, name);
  }

  return path;
}

function getDependency(state: State, name: string): InternalDependencyInfo {
  let index = state.dependencyIndexes.get(name);
  let data = state.dependencyData.get(name);

  if (!data) {
    index = state.dependency++;
    data = {isAsync: true};

    state.dependencyIndexes.set(name, index);
    state.dependencyData.set(name, data);
  }

  return {index: nullthrows(index), data: nullthrows(data)};
}

function getModuleNameFromCallArgs(path: Path): ?string {
  if (path.get('arguments').length !== 1) {
    throw new InvalidRequireCallError(path);
  }

  const result = path.get('arguments.0').evaluate();

  if (result.confident && typeof result.value === 'string') {
    return result.value;
  }

  return null;
}

function createDependencyMapLookup(state: State, name: string): Array<mixed> {
  const memberExpression = types.memberExpression(
    state.dependencyMapIdentifier,
    types.numericLiteral(getDependency(state, name).index),
    true,
  );

  return state.keepRequireNames
    ? [memberExpression, types.stringLiteral(name)]
    : [memberExpression];
}

class InvalidRequireCallError extends Error {
  constructor({node}) {
    const line = node.loc && node.loc.start && node.loc.start.line;

    super(
      `Invalid call at line ${line || '<unknown>'}: ${generate(node).code}`,
    );
  }
}

collectDependencies.InvalidRequireCallError = InvalidRequireCallError;

module.exports = collectDependencies;
