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
const {babelTypes, babelTraverse: traverse} = require('../../babel-bridge');

const MODULE_FACTORY_PARAMETERS = ['global', 'require', 'module', 'exports'];
const POLYFILL_FACTORY_PARAMETERS = ['global'];

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
  let requireName = 'require';

  traverse(ast, {
    Program(path) {
      const body = path.get('body.0.expression.arguments.0.body');

      requireName = body.scope.generateUid('_require');
      body.scope.rename('require', requireName);
    },
  });

  return requireName;
}

module.exports = {
  MODULE_FACTORY_PARAMETERS,
  POLYFILL_FACTORY_PARAMETERS,
  wrapModule,
  wrapPolyfill,
};
