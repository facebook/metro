/**
 * Copyright (c) 2016-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

'use strict';

/* eslint-disable lint/no-unclear-flowtypes */
const babelTypes = require('@babel/types');

const traverse = require('@babel/traverse').default;

const MODULE_FACTORY_PARAMETERS = ['global', 'require', 'module', 'exports'];
const POLYFILL_FACTORY_PARAMETERS = ['global'];
const WRAP_NAME = '$$_REQUIRE'; // note: babel will prefix this with _

function wrapModule(
  fileAst: Object,
  dependencyMapName: string,
): {ast: Object, requireName: string} {
  const t = babelTypes;
  const params = MODULE_FACTORY_PARAMETERS.concat(dependencyMapName);
  const factory = functionFromProgram(fileAst.program, params);
  const def = t.callExpression(t.identifier('__d'), [factory]);
  const ast = t.file(t.program([t.expressionStatement(def)]));

  const requireName = renameRequires(ast);

  return {ast, requireName};
}

function wrapPolyfill(fileAst: Object): Object {
  const t = babelTypes;
  const factory = functionFromProgram(
    fileAst.program,
    POLYFILL_FACTORY_PARAMETERS,
  );
  const iife = t.callExpression(factory, [t.identifier('this')]);
  return t.file(t.program([t.expressionStatement(iife)]));
}

function wrapJson(source: string): string {
  return [
    `__d(function(${MODULE_FACTORY_PARAMETERS.join(', ')}) {`,
    `  module.exports = ${source};`,
    `});`,
  ].join('\n');
}

function functionFromProgram(
  program: Object,
  parameters: Array<string>,
): Object {
  const t = babelTypes;
  return t.functionExpression(
    t.identifier(''),
    parameters.map(makeIdentifier),
    t.blockStatement(program.body, program.directives),
  );
}

function makeIdentifier(name: string): Object {
  return babelTypes.identifier(name);
}

function renameRequires(ast: Object) {
  let newRequireName = WRAP_NAME;

  traverse(ast, {
    Program(path) {
      const body = path.get('body.0.expression.arguments.0.body');

      newRequireName = body.scope.generateUid(WRAP_NAME);
      body.scope.rename('require', newRequireName);
    },
  });

  return newRequireName;
}

module.exports = {
  WRAP_NAME,

  wrapJson,
  wrapModule,
  wrapPolyfill,
};
