/**
 * Copyright (c) 2017-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @flow
 * @format
 */

'use strict';

const optimizeDependencies = require('../optimizeDependencies');

const {babylon} = require('../../../babel-bridge');
const {InvalidRequireCallError} = optimizeDependencies;

const {codeFromAst, comparableCode} = require('../../test-helpers');

const DEP_MAP_NAME = 'arbitrary';
const DEPS = [
  {name: 'b/lib/a', isAsync: false},
  {name: 'do', isAsync: false},
  {name: 'asyncRequire', isAsync: false},
  {name: 'some/async/module', isAsync: true},
  {name: 'setup/something', isAsync: false},
];
const REQUIRE_NAME = 'require';

it('returns dependencies from the transformed AST', () => {
  const ast = astFromCode(`
    const a = require(${DEP_MAP_NAME}[0], 'b/lib/a');
    exports.do = () => require(${DEP_MAP_NAME}[1], "do");
    require(${DEP_MAP_NAME}[2], "asyncRequire")(${DEP_MAP_NAME}[3]).then(foo => {});
    if (!something) {
      require(${DEP_MAP_NAME}[4], "setup/something");
    }
  `);
  const dependencies = optimizeDependencies(
    ast,
    DEPS,
    DEP_MAP_NAME,
    REQUIRE_NAME,
  );
  expect(dependencies).toEqual(DEPS);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
    const a = require(${DEP_MAP_NAME}[0]);
    exports.do = () => require(${DEP_MAP_NAME}[1]);
    require(${DEP_MAP_NAME}[2])(${DEP_MAP_NAME}[3]).then(foo => {});
    if (!something) {
      require(${DEP_MAP_NAME}[4]);
    }
  `),
  );
});

it('strips unused dependencies and translates require() calls', () => {
  const ast = astFromCode(`require(${DEP_MAP_NAME}[1], 'do');`);
  const dependencies = optimizeDependencies(
    ast,
    DEPS,
    DEP_MAP_NAME,
    REQUIRE_NAME,
  );
  expect(dependencies).toEqual([{name: 'do', isAsync: false}]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`require(${DEP_MAP_NAME}[0]);`),
  );
});

it('strips unused dependencies and translates loadForModule() calls', () => {
  const ast = astFromCode(`
    require(${DEP_MAP_NAME}[2], "asyncRequire")(${DEP_MAP_NAME}[3]).then(foo => {});
  `);
  const dependencies = optimizeDependencies(
    ast,
    DEPS,
    DEP_MAP_NAME,
    REQUIRE_NAME,
  );
  expect(dependencies).toEqual([
    {name: 'asyncRequire', isAsync: false},
    {name: 'some/async/module', isAsync: true},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      require(${DEP_MAP_NAME}[0])(${DEP_MAP_NAME}[1]).then(foo => {});
    `),
  );
});

it('strips unused dependencies and translates loadForModule() calls; different ordering', () => {
  const ast = astFromCode(`
    require(${DEP_MAP_NAME}[0], 'something/else');
    require(${DEP_MAP_NAME}[2], "asyncRequire")(${DEP_MAP_NAME}[1]).then(foo => {});
  `);
  const deps = [
    {name: 'something/else', isAsync: false},
    {name: 'some/async/module', isAsync: true},
    {name: 'asyncRequire', isAsync: false},
  ];
  const dependencies = optimizeDependencies(
    ast,
    deps,
    DEP_MAP_NAME,
    REQUIRE_NAME,
  );
  expect(dependencies).toEqual([
    {name: 'something/else', isAsync: false},
    {name: 'asyncRequire', isAsync: false},
    {name: 'some/async/module', isAsync: true},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      require(${DEP_MAP_NAME}[0]);
      require(${DEP_MAP_NAME}[1])(${DEP_MAP_NAME}[2]).then(foo => {});
    `),
  );
});

it('throws if an invalid require() call is encountered', () => {
  const ast = astFromCode(`require(${DEP_MAP_NAME}[1]);`);
  try {
    optimizeDependencies(ast, DEPS, DEP_MAP_NAME, REQUIRE_NAME);
    throw new Error('should not reach this');
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidRequireCallError);
    expect(error.message).toMatchSnapshot();
  }
});

function astFromCode(code) {
  return babylon.parse(code, {plugins: ['dynamicImport']});
}
