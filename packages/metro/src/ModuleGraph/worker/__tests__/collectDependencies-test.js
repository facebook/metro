/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails oncall+javascript_foundation
 * @flow
 * @format
 */

'use strict';

const babylon = require('babylon');
const collectDependencies = require('../collectDependencies');

const {codeFromAst, comparableCode} = require('../../test-helpers');

const {any} = expect;

const {InvalidRequireCallError} = collectDependencies;

it('collects unique dependency identifiers and transforms the AST', () => {
  const ast = astFromCode(`
    const a = require('b/lib/a');
    exports.do = () => require("do");
    if (!something) {
      require("setup/something");
    }
    require('do');
  `);
  const {dependencies, dependencyMapName} = collectDependencies(ast);
  expect(dependencies).toEqual([
    {name: 'b/lib/a', isAsync: false},
    {name: 'do', isAsync: false},
    {name: 'setup/something', isAsync: false},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      const a = require(${dependencyMapName}[0], 'b/lib/a');
      exports.do = () => require(${dependencyMapName}[1], "do");
      if (!something) {
        require(${dependencyMapName}[2], "setup/something");
      }
      require(${dependencyMapName}[1], 'do');
    `),
  );
});

it('collects asynchronous dependencies', () => {
  const ast = astFromCode(`
    import("some/async/module").then(foo => {});
  `);
  const {dependencies, dependencyMapName} = collectDependencies(ast);
  expect(dependencies).toEqual([
    {name: 'some/async/module', isAsync: true},
    {name: 'asyncRequire', isAsync: false},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      require(${dependencyMapName}[1], "asyncRequire")(${dependencyMapName}[0]).then(foo => {});
    `),
  );
});

it('collects mixed dependencies as being sync', () => {
  const ast = astFromCode(`
    const a = require("some/async/module");
    import("some/async/module").then(foo => {});
  `);
  const {dependencies, dependencyMapName} = collectDependencies(ast);
  expect(dependencies).toEqual([
    {name: 'some/async/module', isAsync: false},
    {name: 'asyncRequire', isAsync: false},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      const a = require(${dependencyMapName}[0], "some/async/module");
      require(${dependencyMapName}[1], "asyncRequire")(${dependencyMapName}[0]).then(foo => {});
    `),
  );
});

it('collects mixed dependencies as being sync; reverse order', () => {
  const ast = astFromCode(`
    import("some/async/module").then(foo => {});
    const a = require("some/async/module");
  `);
  const {dependencies, dependencyMapName} = collectDependencies(ast);
  expect(dependencies).toEqual([
    {name: 'some/async/module', isAsync: false},
    {name: 'asyncRequire', isAsync: false},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      require(${dependencyMapName}[1], "asyncRequire")(${dependencyMapName}[0]).then(foo => {});
      const a = require(${dependencyMapName}[0], "some/async/module");
    `),
  );
});

it('supports template literals as arguments', () => {
  const ast = astFromCode('require(`left-pad`)');
  const {dependencies, dependencyMapName} = collectDependencies(ast);
  expect(dependencies).toEqual([{name: 'left-pad', isAsync: false}]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`require(${dependencyMapName}[0], \`left-pad\`);`),
  );
});

it('throws on template literals with interpolations', () => {
  const ast = astFromCode('require(`left${"-"}pad`)');
  try {
    collectDependencies(ast);
    throw new Error('should not reach');
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidRequireCallError);
    expect(error.message).toMatchSnapshot();
  }
});

it('throws on tagged template literals', () => {
  const ast = astFromCode('require(tag`left-pad`)');
  try {
    collectDependencies(ast);
    throw new Error('should not reach');
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidRequireCallError);
    expect(error.message).toMatchSnapshot();
  }
});

it('exposes a string as `dependencyMapName` even without collecting dependencies', () => {
  const ast = astFromCode('');
  expect(collectDependencies(ast).dependencyMapName).toEqual(any(String));
});

function astFromCode(code) {
  return babylon.parse(code, {plugins: ['dynamicImport']});
}
