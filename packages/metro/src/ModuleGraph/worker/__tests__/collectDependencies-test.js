/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @flow
 * @format
 */

'use strict';

const babylon = require('@babel/parser');
const collectDependencies = require('../collectDependencies');
const dedent = require('dedent');
const nullthrows = require('nullthrows');
const t = require('@babel/types');

const {codeFromAst, comparableCode} = require('../../test-helpers');
const {codeFrameColumns} = require('@babel/code-frame');

import type {
  Options,
  State,
  ModuleDependencyRegistry,
  MutableInternalDependency,
  ImportQualifier,
  InternalDependency,
  DependencyTransformer,
} from '../collectDependencies';
import type {NodePath} from '@babel/traverse';

const {any, objectContaining} = expect;

const {InvalidRequireCallError} = collectDependencies;
const opts = {
  asyncRequireModulePath: 'asyncRequire',
  dynamicRequires: 'reject',
  inlineableCalls: [],
  keepRequireNames: true,
  allowOptionalDependencies: false,
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
    {name: 'b/lib/a', data: objectContaining({asyncType: null})},
    {name: 'do', data: objectContaining({asyncType: null})},
    {name: 'setup/something', data: objectContaining({asyncType: null})},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      const a = require(${dependencyMapName}[0], "b/lib/a");
      exports.do = () => require(${dependencyMapName}[1], "do");
      if (!something) {
        require(${dependencyMapName}[2], "setup/something");
      }
      require(${dependencyMapName}[1], "do");
    `),
  );
});

it('uses dependencyMapName parameter as-is if provided', () => {
  const ast = astFromCode(`
    const a = require('b/lib/a');
    exports.do = () => require("do");
    if (!something) {
      require("setup/something");
    }
    require('do');
  `);
  const {dependencies, dependencyMapName} = collectDependencies(ast, {
    ...opts,
    dependencyMapName: '_$$_TEST_DEP_MAP',
  });
  expect(dependencyMapName).toBe('_$$_TEST_DEP_MAP');
  expect(dependencies).toEqual([
    {name: 'b/lib/a', data: objectContaining({asyncType: null})},
    {name: 'do', data: objectContaining({asyncType: null})},
    {name: 'setup/something', data: objectContaining({asyncType: null})},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      const a = require(_$$_TEST_DEP_MAP[0], "b/lib/a");
      exports.do = () => require(_$$_TEST_DEP_MAP[1], "do");
      if (!something) {
        require(_$$_TEST_DEP_MAP[2], "setup/something");
      }
      require(_$$_TEST_DEP_MAP[1], "do");
    `),
  );
});

it('collects asynchronous dependencies', () => {
  const ast = astFromCode(`
    import("some/async/module").then(foo => {});
  `);
  const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
  expect(dependencies).toEqual([
    {name: 'some/async/module', data: objectContaining({asyncType: 'async'})},
    {name: 'asyncRequire', data: objectContaining({asyncType: null})},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      require(${dependencyMapName}[1], "asyncRequire")(${dependencyMapName}[0], "some/async/module").then(foo => {});
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
    {name: 'some/async/module', data: objectContaining({asyncType: null})},
    {name: 'asyncRequire', data: objectContaining({asyncType: null})},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      const a = require(${dependencyMapName}[0], "some/async/module");
      require(${dependencyMapName}[1], "asyncRequire")(${dependencyMapName}[0], "some/async/module").then(foo => {});
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
    {name: 'some/async/module', data: objectContaining({asyncType: null})},
    {name: 'asyncRequire', data: objectContaining({asyncType: null})},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      require(${dependencyMapName}[1], "asyncRequire")(${dependencyMapName}[0], "some/async/module").then(foo => {});
      const a = require(${dependencyMapName}[0], "some/async/module");
    `),
  );
});

it('collects __jsResource calls', () => {
  const ast = astFromCode(`
    __jsResource("some/async/module");
  `);
  const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
  expect(dependencies).toEqual([
    {name: 'some/async/module', data: objectContaining({asyncType: 'async'})},
    {name: 'asyncRequire', data: objectContaining({asyncType: null})},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      require(${dependencyMapName}[1], "asyncRequire").resource(${dependencyMapName}[0], "some/async/module");
    `),
  );
});

it('collects conditionallySplitJSResource calls', () => {
  const ast = astFromCode(`
    __conditionallySplitJSResource("some/async/module", {mobileConfigName: 'aaa'});
    __conditionallySplitJSResource("some/async/module", {mobileConfigName: 'bbb'});
  `);
  const {dependencies} = collectDependencies(ast, opts);
  expect(dependencies).toEqual([
    {name: 'some/async/module', data: objectContaining({asyncType: 'async'})},
    {name: 'asyncRequire', data: objectContaining({asyncType: null})},
  ]);
});

describe('import() prefetching', () => {
  it('collects prefetch calls', () => {
    const ast = astFromCode(`
      __prefetchImport("some/async/module");
    `);
    const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([
      {
        name: 'some/async/module',
        data: objectContaining({asyncType: 'prefetch'}),
      },
      {name: 'asyncRequire', data: objectContaining({asyncType: null})},
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        require(${dependencyMapName}[1], "asyncRequire").prefetch(${dependencyMapName}[0], "some/async/module");
      `),
    );
  });

  it('disable prefetch-only flag for mixed import/prefetch calls', () => {
    const ast = astFromCode(`
      __prefetchImport("some/async/module");
      import("some/async/module").then(() => {});
    `);
    const {dependencies} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([
      {name: 'some/async/module', data: objectContaining({asyncType: 'async'})},
      {name: 'asyncRequire', data: objectContaining({asyncType: null})},
    ]);
  });
});

describe('Evaluating static arguments', () => {
  it('supports template literals as arguments', () => {
    const ast = astFromCode('require(`left-pad`)');
    const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([
      {name: 'left-pad', data: objectContaining({asyncType: null})},
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`require(${dependencyMapName}[0], "left-pad");`),
    );
  });

  it('supports template literals with static interpolations', () => {
    const ast = astFromCode('require(`left${"-"}pad`)');
    const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([
      {name: 'left-pad', data: objectContaining({asyncType: null})},
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`require(${dependencyMapName}[0], "left-pad");`),
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
    expect(dependencies).toEqual([
      {name: 'foo_bar', data: objectContaining({asyncType: null})},
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`require(${dependencyMapName}[0], "foo_bar");`),
    );
  });

  it('supports concatenating strings and template literasl', () => {
    const ast = astFromCode('require("foo_" + "bar" + `_baz`)');
    const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([
      {name: 'foo_bar_baz', data: objectContaining({asyncType: null})},
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`require(${dependencyMapName}[0], "foo_bar_baz");`),
    );
  });

  it('supports using static variables in require statements', () => {
    const ast = astFromCode('const myVar="my"; require("foo_" + myVar)');
    const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([
      {name: 'foo_my', data: objectContaining({asyncType: null})},
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(
        `const myVar = "my"; require(${dependencyMapName}[0], "foo_my");`,
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
      inlineableCalls: [],
      keepRequireNames: true,
      allowOptionalDependencies: false,
    };
    const {dependencies} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        (function (line) {
          throw new Error('Dynamic require defined at line ' + line + '; not supported by Metro');
        })(1);
      `),
    );
  });
});

it('exposes a string as `dependencyMapName` even without collecting dependencies', () => {
  const ast = astFromCode('');
  expect(collectDependencies(ast, opts).dependencyMapName).toEqual(any(String));
});

it('ignores require functions defined defined by lower scopes', () => {
  const ast = astFromCode(`
    const a = require('b/lib/a');
    exports.do = () => require("do");
    if (!something) {
      require("setup/something");
    }
    require('do');
    function testA(require) {
      const b = require('nonExistantModule');
    }
    {
      const require = function(foo) {
        return;
      }
      require('nonExistantModule');
    }
  `);
  const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
  expect(dependencies).toEqual([
    {name: 'b/lib/a', data: objectContaining({asyncType: null})},
    {name: 'do', data: objectContaining({asyncType: null})},
    {name: 'setup/something', data: objectContaining({asyncType: null})},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      const a = require(${dependencyMapName}[0], "b/lib/a");
      exports.do = () => require(${dependencyMapName}[1], "do");
      if (!something) {
        require(${dependencyMapName}[2], "setup/something");
      }
      require(${dependencyMapName}[1], "do");
      function testA(require) {
        const b = require('nonExistantModule');
      }
      {
        const require = function (foo) { return; };
        require('nonExistantModule');
      }
    `),
  );
});

it('collects imports', () => {
  const ast = astFromCode(`
    import b from 'b/lib/a';
    import * as d from 'do';
    import type {s} from 'setup/something';
  `);

  const {dependencies} = collectDependencies(ast, opts);

  expect(dependencies).toEqual([
    {name: 'b/lib/a', data: objectContaining({asyncType: null})},
    {name: 'do', data: objectContaining({asyncType: null})},
    {name: 'setup/something', data: objectContaining({asyncType: null})},
  ]);
});

it('collects export from', () => {
  const ast = astFromCode(`
    export type {Apple} from 'Apple';
    export {Banana} from 'Banana';
    export * from 'Kiwi';
  `);

  const {dependencies} = collectDependencies(ast, opts);
  expect(dependencies).toEqual([
    {name: 'Apple', data: objectContaining({asyncType: null})},
    {name: 'Banana', data: objectContaining({asyncType: null})},
    {name: 'Kiwi', data: objectContaining({asyncType: null})},
  ]);
});

it('records locations of dependencies', () => {
  const code = dedent`
    import b from 'b/lib/a';
    import * as d from 'do';
    import type {s} from 'setup/something';
    import('some/async/module').then(foo => {});
    __jsResource('some/async/module');
    __conditionallySplitJSResource('some/async/module', {mobileConfigName: 'aaa'});
    __conditionallySplitJSResource('some/async/module', {mobileConfigName: 'bbb'});
    require('foo'); __prefetchImport('baz');
    interopRequireDefault(require('quux')); // Simulated Babel output
  `;
  const ast = astFromCode(code);

  // Babel does not guarantee a loc on generated `require()`s.
  // $FlowFixMe Discovered when typing @babel/parser
  delete ast.program.body[ast.program.body.length - 1].expression.arguments[0]
    .loc;

  const {dependencies} = collectDependencies(ast, opts);

  for (const dep of dependencies) {
    expect(dep).toEqual(
      objectContaining({data: objectContaining({locs: any(Array)})}),
    );
  }
  expect(formatDependencyLocs(dependencies, code)).toMatchInlineSnapshot(`
    "
    > 1 | import b from 'b/lib/a';
        | ^^^^^^^^^^^^^^^^^^^^^^^^ dep #0 (b/lib/a)
    > 2 | import * as d from 'do';
        | ^^^^^^^^^^^^^^^^^^^^^^^^ dep #1 (do)
    > 3 | import type {s} from 'setup/something';
        | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #2 (setup/something)
    > 4 | import('some/async/module').then(foo => {});
        | ^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #3 (some/async/module)
    > 5 | __jsResource('some/async/module');
        | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #3 (some/async/module)
    > 6 | __conditionallySplitJSResource('some/async/module', {mobileConfigName: 'aaa'});
        | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #3 (some/async/module)
    > 7 | __conditionallySplitJSResource('some/async/module', {mobileConfigName: 'bbb'});
        | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #3 (some/async/module)
    > 4 | import('some/async/module').then(foo => {});
        | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #4 (asyncRequire)
    > 5 | __jsResource('some/async/module');
        | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #4 (asyncRequire)
    > 6 | __conditionallySplitJSResource('some/async/module', {mobileConfigName: 'aaa'});
        | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #4 (asyncRequire)
    > 7 | __conditionallySplitJSResource('some/async/module', {mobileConfigName: 'bbb'});
        | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #4 (asyncRequire)
    > 8 | require('foo'); __prefetchImport('baz');
        |                 ^^^^^^^^^^^^^^^^^^^^^^^^ dep #4 (asyncRequire)
    > 8 | require('foo'); __prefetchImport('baz');
        | ^^^^^^^^^^^^^^ dep #5 (foo)
    > 8 | require('foo'); __prefetchImport('baz');
        |                 ^^^^^^^^^^^^^^^^^^^^^^^ dep #6 (baz)
    > 9 | interopRequireDefault(require('quux')); // Simulated Babel output
        | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #7 (quux)"
  `);
});

describe('optional dependencies', () => {
  const opts: Options<> = {
    asyncRequireModulePath: 'asyncRequire',
    dynamicRequires: 'reject',
    inlineableCalls: [],
    keepRequireNames: true,
    allowOptionalDependencies: true,
  };
  const validateDependencies = (dependencies, expectedCount) => {
    let hasAsync = false;
    let checked = 0;
    dependencies.forEach(d => {
      if (d.name.includes('-async')) {
        expect(d.data.asyncType).toBe('async');
        hasAsync = true;
      } else {
        expect(d.data.asyncType).toBe(null);
      }
      if (
        d.name.startsWith('optional') ||
        d.name.startsWith('@somescope/optional')
      ) {
        checked += 1;
        expect(d.data.isOptional).toBeTruthy();
      } else if (
        d.name.startsWith('not-optional') ||
        d.name.startsWith('@somescope/not-optional')
      ) {
        checked += 1;
        expect(d.data.isOptional).toBeFalsy();
      }
    });
    expect(dependencies).toHaveLength(checked + (hasAsync ? 1 : 0));
    expect(dependencies).toHaveLength(expectedCount);
  };
  it('dependency in try-block within 1-level will be optional', () => {
    const ast = astFromCode(`
      function fFunc() {
        import('not-optional-async-f').then();
      }
      try {
        const a = require('optional-a');
        if(true) {
          const b = require('not-optional-b');
        }
        const cFunc = () => {
          const c = require('not-optional-c');
        }
        fFunc();
        cFunc();

        import('optional-async-d');
      } catch(e) {
        require('not-optional-e');
      } finally {
        require('not-optional-g');
      }
      `);

    const {dependencies} = collectDependencies(ast, opts);
    validateDependencies(dependencies, 8);
  });
  it('nested try-block follows the inner-most scope', () => {
    const ast = astFromCode(`
    try {
      const a = require('optional-a');
      try{
        const b = import('optional-async-b');
      } finally {}
      const c = require('optional-c');
    } catch(e) {}
    `);

    const {dependencies} = collectDependencies(ast, opts);
    validateDependencies(dependencies, 4);
  });
  it('can handle single-line statement', () => {
    const ast = astFromCode(
      "try { const a = require('optional-a') } catch (e) {}",
    );
    const {dependencies} = collectDependencies(ast, opts);
    validateDependencies(dependencies, 1);
  });
  it('independent of sibiling context', () => {
    const ast = astFromCode(`
      try {
        const x = whatever;
        const a = x ? require('optional-a') : require('optional-b');
      } catch (e) {}
    `);
    const {dependencies} = collectDependencies(ast, opts);
    validateDependencies(dependencies, 2);
  });
  it('ignores require functions defined by lower scopes', () => {
    const ast = astFromCode(`
      const f = (require) => {
        try {
          const c = require('not-dependency');
        } catch (e) {}
      };
    `);
    const {dependencies} = collectDependencies(ast, opts);
    expect(dependencies).toHaveLength(0);
  });
  it('supports using static variables in require statements', () => {
    const ast = astFromCode(`
      const myVar="my";
      try {
        require("foo_" + myVar);
        require(\`bar_\${5 + 2}\`);
      } catch (e) {}
      `);
    const {dependencies} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([
      {
        name: 'foo_my',
        data: objectContaining({asyncType: null, isOptional: true}),
      },
      {
        name: 'bar_7',
        data: objectContaining({asyncType: null, isOptional: true}),
      },
    ]);
  });
  it('can exclude optional dependency', () => {
    const ast = () =>
      astFromCode(`
      const n = 2;
      try {
        const a = require(\`A-\${1 + n}\`);
        const b = require(\`A-\${3 + n}\`);
      } catch (e) {}
    `);
    const {dependencies: deps1} = collectDependencies(ast(), opts);
    expect(deps1).toEqual([
      {name: 'A-3', data: objectContaining({isOptional: true})},
      {name: 'A-5', data: objectContaining({isOptional: true})},
    ]);

    const {dependencies: deps2} = collectDependencies(ast(), {
      ...opts,
      allowOptionalDependencies: false,
    });
    expect(deps2).toEqual([
      {name: 'A-3', data: expect.not.objectContaining({isOptional: true})},
      {name: 'A-5', data: expect.not.objectContaining({isOptional: true})},
    ]);

    const {dependencies: deps3} = collectDependencies(ast(), {
      ...opts,
      allowOptionalDependencies: {exclude: ['A-5']},
    });
    expect(deps3).toEqual([
      {name: 'A-3', data: objectContaining({isOptional: true})},
      {name: 'A-5', data: expect.not.objectContaining({isOptional: true})},
    ]);
  });
});

it('uses the dependency transformer specified in the options to transform the dependency calls', () => {
  const ast = astFromCode(`
    const a = require('b/lib/a');
    require(1)
    import b from 'b/lib/b';
    export {Banana} from 'Banana';

    import("some/async/module").then(foo => {});
    __jsResource("some/async/module");
    __conditionallySplitJSResource("some/async/module", {mobileConfigName: 'aaa'});
    __prefetchImport("some/async/module");
  `);

  const {ast: transformedAst} = collectDependencies(ast, {
    ...opts,
    dynamicRequires: 'throwAtRuntime',
    dependencyTransformer: MockDependencyTransformer,
  });

  expect(codeFromAst(transformedAst)).toEqual(
    comparableCode(`
      const a = require(_dependencyMap[0], "b/lib/a");
      requireIllegalDynamicRequire();
      import b from 'b/lib/b';
      export { Banana } from 'Banana';
      require("asyncRequire").async(_dependencyMap[3], "some/async/module").then(foo => {});
      require("asyncRequire").jsresource(_dependencyMap[3], "some/async/module");
      require("asyncRequire").jsresource(_dependencyMap[3], "some/async/module");
      require("asyncRequire").prefetch(_dependencyMap[3], "some/async/module");
      `),
  );
});

it('uses the dependency registry specified in the options to register dependencies', () => {
  const ast = astFromCode(`
      const a = require('b/lib/a');
      import b from 'b/lib/b';
      export {Banana} from 'Banana';

      import("some/async/module").then(foo => {});
      __jsResource("a/jsresouce");
      __conditionallySplitJSResource("a/conditional/jsresource", {mobileConfigName: 'aaa'});
      __prefetchImport("a/prefetch/module");
    `);

  const {dependencies} = collectDependencies(ast, {
    ...opts,
    dependencyTransformer: MockDependencyTransformer,
    dependencyRegistry: new MockModuleDependencyRegistry(),
  });

  expect(dependencies).toEqual([
    {name: 'b/lib/a', data: objectContaining({asyncType: null})},
    {name: 'b/lib/b', data: objectContaining({asyncType: null})},
    {name: 'Banana', data: objectContaining({asyncType: null})},
    {name: 'some/async/module', data: objectContaining({asyncType: 'async'})},
    {name: 'a/jsresouce', data: objectContaining({asyncType: 'async'})},
    {
      name: 'a/conditional/jsresource',
      data: objectContaining({splitCondition: {mobileConfigName: 'aaa'}}),
    },
    {
      name: 'a/prefetch/module',
      data: objectContaining({asyncType: 'prefetch'}),
    },
  ]);
});

function formatDependencyLocs(dependencies, code) {
  return (
    '\n' +
    dependencies
      .map((dep, depIndex) =>
        dep.data.locs.length
          ? dep.data.locs
              .map(loc => formatLoc(loc, depIndex, dep, code))
              .join('\n')
          : `dep #${depIndex} (${dep.name}): no location recorded`,
      )
      .join('\n')
  );
}

function adjustPosForCodeFrame(pos) {
  return pos ? {...pos, column: pos.column + 1} : pos;
}

function adjustLocForCodeFrame(loc) {
  return {
    start: adjustPosForCodeFrame(loc.start),
    end: adjustPosForCodeFrame(loc.end),
  };
}

function formatLoc(loc, depIndex, dep, code) {
  return codeFrameColumns(code, adjustLocForCodeFrame(loc), {
    message: `dep #${depIndex} (${dep.name})`,
    linesAbove: 0,
    linesBelow: 0,
  });
}

function astFromCode(code: string): BabelNodeFile {
  return babylon.parse(code, {
    plugins: ['dynamicImport', 'flow'],
    sourceType: 'module',
  });
}

// Mock registry that collects *all* `registerDependency` calls.
// Allows to verify that the `registerDependency` function was called for each
// extracted dependency. Collapsing dependencies is implemented by specific
// `collectDependencies` implementations and should be tested there.
class MockModuleDependencyRegistry<TSplitCondition>
  implements ModuleDependencyRegistry<TSplitCondition> {
  _dependencies: Array<InternalDependency<TSplitCondition>> = [];

  registerDependency(
    qualifier: ImportQualifier,
  ): InternalDependency<TSplitCondition> {
    const data: MutableInternalDependency<TSplitCondition> = {
      index: this._dependencies.length,
      name: qualifier.name,
      asyncType: qualifier.asyncType,
      isOptional: qualifier.optional ?? false,
      locs: [],
    };

    if (qualifier.splitCondition) {
      data.splitCondition = qualifier.splitCondition.evaluate().value;
    }

    this._dependencies.push(data);
    return data;
  }

  getDependencies(): Array<InternalDependency<TSplitCondition>> {
    return this._dependencies;
  }
}

// Mock transformer for dependencies. Uses a "readable" format
// require() -> require(id, module name)
// import() -> require(async moudle name).async(id, module name)
// jsresource -> require(async moudle name).jsresource(id, module name)
// prefetch -> require(async moudle name).prefetch(id, module name)
const MockDependencyTransformer: DependencyTransformer<mixed> = {
  transformSyncRequire(
    path: NodePath<>,
    dependency: InternalDependency<mixed>,
    state: State<mixed>,
  ): void {
    path.replaceWith(
      t.callExpression(t.identifier('require'), [
        createModuleIDExpression(dependency, state),
        t.stringLiteral(dependency.name),
      ]),
    );
  },

  transformImportCall(
    path: NodePath<>,
    dependency: InternalDependency<mixed>,
    state: State<mixed>,
  ): void {
    transformAsyncRequire(path, dependency, state, 'async');
  },

  transformJSResource(
    path: NodePath<>,
    dependency: InternalDependency<mixed>,
    state: State<mixed>,
  ): void {
    transformAsyncRequire(path, dependency, state, 'jsresource');
  },

  transformPrefetch(
    path: NodePath<>,
    dependency: InternalDependency<mixed>,
    state: State<mixed>,
  ): void {
    transformAsyncRequire(path, dependency, state, 'prefetch');
  },

  transformIllegalDynamicRequire(path: NodePath<>, state: State<mixed>): void {
    path.replaceWith(
      t.callExpression(t.identifier('requireIllegalDynamicRequire'), []),
    );
  },
};

function createModuleIDExpression(
  dependency: InternalDependency<mixed>,
  state: State<mixed>,
) {
  return t.memberExpression(
    nullthrows(state.dependencyMapIdentifier),
    t.numericLiteral(dependency.index),
    true,
  );
}

function transformAsyncRequire(
  path: NodePath<>,
  dependency: InternalDependency<mixed>,
  state: State<mixed>,
  methodName: string,
): void {
  const moduleID = createModuleIDExpression(dependency, state);

  const asyncRequireCall = t.callExpression(t.identifier('require'), [
    nullthrows(state.asyncRequireModulePathStringLiteral),
  ]);

  path.replaceWith(
    t.callExpression(
      t.memberExpression(asyncRequireCall, t.identifier(methodName)),
      [moduleID, t.stringLiteral(dependency.name)],
    ),
  );

  // Don't transform e.g. the require('asyncRequire') calls. Requiring the transformation of the
  // `require(asyncrRequireModule) is an implementation detail of the requires transformer and should
  // be tested with the concrete implementations.
  path.skip();
}
