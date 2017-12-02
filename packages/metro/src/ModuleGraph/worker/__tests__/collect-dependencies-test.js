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
const collectDependencies = require('../collect-dependencies');

const {codeFromAst, comparableCode} = require('../../test-helpers');

const {any} = expect;

const {InvalidRequireCallError} = collectDependencies;

describe('dependency collection from ASTs', () => {
  it('collects dependency identifiers from the code', () => {
    const ast = astFromCode(`
      const a = require('b/lib/a');
      exports.do = () => require("do");
      if (!something) {
        require("setup/something");
      }
    `);

    const result = collectDependencies(ast);
    expect(result.dependencies).toEqual([
      {name: 'b/lib/a', isAsync: false},
      {name: 'do', isAsync: false},
      {name: 'setup/something', isAsync: false},
    ]);
  });

  it('collects asynchronous dependencies', () => {
    const ast = astFromCode(`
      const a = require('b/lib/a');
      if (!something) {
        import("some/async/module").then(foo => {});
      }
    `);

    const result = collectDependencies(ast);
    expect(result.dependencies).toEqual([
      {name: 'b/lib/a', isAsync: false},
      {name: 'some/async/module', isAsync: true},
      {name: 'BundleSegments', isAsync: false},
    ]);
  });

  it('collects mixed dependencies as being sync', () => {
    const ast = astFromCode(`
      const a = require('b/lib/a');
      import('b/lib/a');
    `);

    const result = collectDependencies(ast);
    expect(result.dependencies).toEqual([
      {name: 'b/lib/a', isAsync: false},
      {name: 'BundleSegments', isAsync: false},
    ]);
  });

  it('supports template literals as arguments', () => {
    const ast = astFromCode('require(`left-pad`)');

    expect(collectDependencies(ast).dependencies).toEqual([
      {name: 'left-pad', isAsync: false},
    ]);
  });

  it('throws on template literals with interpolations', () => {
    const ast = astFromCode('require(`left${"-"}pad`)');

    expect(() => collectDependencies(ast).dependencies).toThrowError(
      InvalidRequireCallError,
    );
  });

  it('throws on tagged template literals', () => {
    const ast = astFromCode('require(tag`left-pad`)');

    expect(() => collectDependencies(ast).dependencies).toThrowError(
      InvalidRequireCallError,
    );
  });

  it('exposes a string as `dependencyMapName`', () => {
    const ast = astFromCode('require("arbitrary")');
    expect(collectDependencies(ast).dependencyMapName).toEqual(any(String));
  });

  it('exposes a string as `dependencyMapName` even without collecting dependencies', () => {
    const ast = astFromCode('');
    expect(collectDependencies(ast).dependencyMapName).toEqual(any(String));
  });

  it('replaces all required module ID strings with array lookups, keeps the ID as second argument', () => {
    const ast = astFromCode(`
        const a = require('b/lib/a');
        exports.do = () => require("do");
        import("some/async/module").then(foo => {});
        if (!something) {
          require("setup/something");
        }
      `);

    const {dependencyMapName} = collectDependencies(ast);

    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        const a = require(${dependencyMapName}[0], 'b/lib/a');
        exports.do = () => require(${dependencyMapName}[1], "do");
        require(_dependencyMap[3], "BundleSegments").loadForModule(_dependencyMap[2]).then(function () { return require(_dependencyMap[2], "some/async/module"); }).then(foo => {});
        if (!something) {
          require(${dependencyMapName}[4], "setup/something");
        }
      `),
    );
  });
});

describe('Dependency collection from optimized ASTs', () => {
  const dependencyMapName = 'arbitrary';
  const {forOptimization} = collectDependencies;
  let ast, deps;

  beforeEach(() => {
    ast = astFromCode(`
      const a = require(${dependencyMapName}[0], 'b/lib/a');
      exports.do = () => require(${dependencyMapName}[1], "do");
      require(${dependencyMapName}[2], "BundleSegments").loadForModule(${dependencyMapName}[3]).then(function () { return require(${dependencyMapName}[3], "some/async/module"); }).then(foo => {});
      if (!something) {
        require(${dependencyMapName}[4], "setup/something");
      }
    `);
    deps = [
      {name: 'b/lib/a', isAsync: false},
      {name: 'do', isAsync: false},
      {name: 'BundleSegments', isAsync: false},
      {name: 'some/async/module', isAsync: true},
      {name: 'setup/something', isAsync: false},
    ];
  });

  it('passes the `dependencyMapName` through', () => {
    const result = forOptimization(ast, deps, dependencyMapName);
    expect(result.dependencyMapName).toEqual(dependencyMapName);
  });

  it('returns the list of passed in dependencies', () => {
    const result = forOptimization(ast, deps, dependencyMapName);
    expect(result.dependencies).toEqual(deps);
  });

  it('only returns dependencies that are in the code', () => {
    ast = astFromCode(`require(${dependencyMapName}[1], 'do')`);
    const result = forOptimization(ast, deps, dependencyMapName);
    expect(result.dependencies).toEqual([{name: 'do', isAsync: false}]);
  });

  it('only returns dependencies that are in the code, and properly translate async dependencies', () => {
    ast = astFromCode(`
      require(${dependencyMapName}[2], "BundleSegments").loadForModule(${dependencyMapName}[3]).then(function () { return require(${dependencyMapName}[3], "some/async/module"); }).then(foo => {});
    `);
    const result = forOptimization(ast, deps, dependencyMapName);
    expect(result.dependencies).toEqual([
      {name: 'BundleSegments', isAsync: false},
      {name: 'some/async/module', isAsync: true},
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        require(${dependencyMapName}[0]).loadForModule(${dependencyMapName}[1]).then(function () { return require(${dependencyMapName}[1]); }).then(foo => {});
      `),
    );
  });

  it('replaces all call signatures inserted by a prior call to `collectDependencies`', () => {
    forOptimization(ast, deps, dependencyMapName);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
      const a = require(${dependencyMapName}[0]);
      exports.do = () => require(${dependencyMapName}[1]);
      require(${dependencyMapName}[2]).loadForModule(${dependencyMapName}[3]).then(function () { return require(${dependencyMapName}[3]); }).then(foo => {});
      if (!something) {
        require(${dependencyMapName}[4]);
      }
    `),
    );
  });
});

function astFromCode(code) {
  return babylon.parse(code, {plugins: ['dynamicImport']});
}
