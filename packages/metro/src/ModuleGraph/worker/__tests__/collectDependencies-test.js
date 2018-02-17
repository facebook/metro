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

const collectDependencies = require('../collectDependencies');

const {babylon} = require('../../../babel-bridge');
const {codeFromAst, comparableCode} = require('../../test-helpers');

const {any} = expect;

const {InvalidRequireCallError} = collectDependencies;
const opts = {
  asyncRequireModulePath: 'asyncRequire',
  dynamicRequires: 'reject',
};

it('collects unique dependency identifiers and transforms the AST', () => {
  const ast = astFromCode(`
    const a = require('b/lib/a');
    exports.do = () => require("do");
    if (!something) {
      require("setup/something");
    }
    require('do');
  `);
  const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
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
  const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
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
  const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
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
  const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
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

describe('Evaluating static arguments', () => {
  it('supports template literals as arguments', () => {
    const ast = astFromCode('require(`left-pad`)');
    const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([{name: 'left-pad', isAsync: false}]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`require(${dependencyMapName}[0], \`left-pad\`);`),
    );
  });

  it('supports template literals with static interpolations', () => {
    const ast = astFromCode('require(`left${"-"}pad`)');
    const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([{name: 'left-pad', isAsync: false}]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`require(${dependencyMapName}[0], \`left\${"-"}pad\`);`),
    );
  });

  it('throws template literals with dyncamic interpolations', () => {
    const ast = astFromCode('let foo;require(`left${foo}pad`)');
    try {
      collectDependencies(ast, opts);
      throw new Error('should not reach');
    } catch (error) {
      if (!(error instanceof InvalidRequireCallError)) {
        throw error;
      }
      expect(error.message).toMatchSnapshot();
    }
  });

  it('throws on tagged template literals', () => {
    const ast = astFromCode('require(tag`left-pad`)');
    try {
      collectDependencies(ast, opts);
      throw new Error('should not reach');
    } catch (error) {
      if (!(error instanceof InvalidRequireCallError)) {
        throw error;
      }
      expect(error.message).toMatchSnapshot();
    }
  });

  it('supports multiple static strings concatenated', () => {
    const ast = astFromCode('require("foo_" + "bar")');
    const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([{name: 'foo_bar', isAsync: false}]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`require(${dependencyMapName}[0], "foo_" + "bar");`),
    );
  });

  it('supports concatenating strings and template literasl', () => {
    const ast = astFromCode('require("foo_" + "bar" + `_baz`)');
    const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([{name: 'foo_bar_baz', isAsync: false}]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(
        `require(${dependencyMapName}[0], "foo_" + "bar" + \`_baz\`);`,
      ),
    );
  });

  it('supports using static variables in require statements', () => {
    const ast = astFromCode('const myVar="my";require("foo_" + myVar)');
    const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([{name: 'foo_my', isAsync: false}]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(
        `const myVar = \"my\"; require(${dependencyMapName}[0], "foo_" + myVar);`,
      ),
    );
  });

  it('throws when requiring non-strings', () => {
    const ast = astFromCode('require(1)');
    try {
      collectDependencies(ast, opts);
      throw new Error('should not reach');
    } catch (error) {
      if (!(error instanceof InvalidRequireCallError)) {
        throw error;
      }
      expect(error.message).toMatchSnapshot();
    }
  });

  it('throws at runtime when requiring non-strings with special option', () => {
    const ast = astFromCode('require(1)');
    const opts = {
      asyncRequireModulePath: 'asyncRequire',
      dynamicRequires: 'throwAtRuntime',
    };
    const {dependencies} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(
        "(function (name) { throw new Error('Module `' + name " +
          "+ '` was required dynamically. This is not supported by " +
          "Metro bundler.'); })(1);",
      ),
    );
  });
});

it('exposes a string as `dependencyMapName` even without collecting dependencies', () => {
  const ast = astFromCode('');
  expect(collectDependencies(ast, opts).dependencyMapName).toEqual(any(String));
});

function astFromCode(code) {
  return babylon.parse(code, {plugins: ['dynamicImport']});
}
