/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

'use strict';

import type {FunctionExpression, Identifier, Program} from '@babel/types';

import template from '@babel/template';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import invariant from 'invariant';

const WRAP_NAME = '$$_REQUIRE'; // note: babel will prefix this with _

// Check first the `global` variable as the global object. This way serializers
// can create a local variable called global to fake it as a global object
// without having to pollute the window object on web.
const IIFE_PARAM = template.expression(
  "typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : this",
);

function wrapModule(
  fileAst: BabelNodeFile,
  importDefaultName: string,
  importAllName: string,
  dependencyMapName: string,
  globalPrefix: string,
): {
  ast: BabelNodeFile,
  requireName: string,
} {
  const params = buildParameters(
    importDefaultName,
    importAllName,
    dependencyMapName,
  );
  const factory = functionFromProgram(fileAst.program, params);
  const def = t.callExpression(t.identifier(`${globalPrefix}__d`), [factory]);
  const ast = t.file(t.program([t.expressionStatement(def)]));

  const requireName = renameRequires(ast);

  return {ast, requireName};
}

function wrapPolyfill(fileAst: BabelNodeFile): BabelNodeFile {
  const factory = functionFromProgram(fileAst.program, ['global']);

  const iife = t.callExpression(factory, [IIFE_PARAM()]);
  return t.file(t.program([t.expressionStatement(iife)]));
}

function jsonToCommonJS(source: string): string {
  return `module.exports = ${source};`;
}

function wrapJson(source: string, globalPrefix: string): string {
  // Unused parameters; remember that's wrapping JSON.
  const moduleFactoryParameters = buildParameters(
    '_importDefaultUnused',
    '_importAllUnused',
    '_dependencyMapUnused',
  );

  return [
    `${globalPrefix}__d(function(${moduleFactoryParameters.join(', ')}) {`,
    `  ${jsonToCommonJS(source)}`,
    '});',
  ].join('\n');
}

function functionFromProgram(
  program: Program,
  parameters: $ReadOnlyArray<string>,
): FunctionExpression {
  return t.functionExpression(
    undefined,
    parameters.map(makeIdentifier),
    t.blockStatement(program.body, program.directives),
  );
}

function makeIdentifier(name: string): Identifier {
  return t.identifier(name);
}

function buildParameters(
  importDefaultName: string,
  importAllName: string,
  dependencyMapName: string,
): $ReadOnlyArray<string> {
  return [
    'global',
    'require',
    importDefaultName,
    importAllName,
    'module',
    'exports',
    dependencyMapName,
  ];
}

// Renaming requires should ideally only be done when generating for the target
// that expects the custom require name in the optimize step.
// This visitor currently renames all `require` references even if the module
// contains a custom `require` declaration. This should be fixed by only renaming
// if the `require` symbol hasn't been redeclared.
function renameRequires(ast: BabelNodeFile): string {
  let newRequireName = WRAP_NAME;

  traverse(ast, {
    Program(path) {
      const body = path.get('body.0.expression.arguments.0.body');

      invariant(
        !Array.isArray(body),
        'metro: Expected `body` to be a single path.',
      );

      newRequireName = body.scope.generateUid(WRAP_NAME);
      body.scope.rename('require', newRequireName);
    },
  });

  return newRequireName;
}

module.exports = {
  WRAP_NAME,

  wrapJson,
  jsonToCommonJS,
  wrapModule,
  wrapPolyfill,
};
