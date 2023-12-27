/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

/* eslint-disable max-len */

'use strict';

const inlineRequiresPlugin = require('../inline-requires-plugin');
const validateOutputAst = require('./validateOutputAst');
const babel = require('@babel/core');
const pluginTester = require('babel-plugin-tester');

pluginTester({
  babelOptions: {
    babelrc: false,
    configFile: false,
  },
  plugin: inlineRequiresPlugin,
  pluginOptions: {
    ignoredRequires: ['CommonFoo'],
    inlineableCalls: ['customStuff'],
  },
  tests: {
    'inlines single usage': {
      code: ['var foo = require("foo");', 'foo.bar()'].join('\n'),
      snapshot: true,
    },

    'inlines multiple usages': {
      code: ['var foo = require("foo");', 'foo.bar()', 'foo.baz()'].join('\n'),
      snapshot: true,
    },

    'inlines any number of variable declarations': {
      code: [
        'var foo = require("foo"), bar = require("bar"), baz = 4;',
        'foo.method()',
      ].join('\n'),
      snapshot: true,
    },

    'ignores requires that are not assigned': {
      code: ['require("foo");'].join('\n'),
      snapshot: false,
    },

    'delete unused requires': {
      code: ['var foo = require("foo");'].join('\n'),
      snapshot: true,
    },

    'ignores requires that are re-assigned': {
      code: ['var foo = require("foo");', 'foo = "bar";'].join('\n'),
      snapshot: false,
    },

    'ensures that the inlined require still points to the global require function':
      {
        code: `
          const foo = require('foo');

          function test() {
            function require(condition) {
              if (!condition) {
                throw new Error('Condition is falsy');
              }
            }

            require(foo.isOnline());
          }
        `,
        snapshot: true,
      },

    'ensures that the inlined require still points to the global require function with inlineableCalls options':
      {
        code: `
          const foo = customStuff('foo');

          function test() {
            function customStuff(condition) {
              if (!condition) {
                throw new Error('Condition is falsy');
              }
            }

            customStuff(foo.isOnline());
          }
        `,
        snapshot: true,
      },

    'ensures that the inlined require still points to the global require function even if local require is not called':
      {
        code: `
          const foo = require('foo');

          function test() {
            function require(condition) {
              if (!condition) {
                throw new Error('Condition is falsy');
              }
            }

            foo.isOnline();
          }
        `,
        snapshot: true,
      },

    'does not transform require calls if require is redeclared in the same declaration scope':
      {
        code: `
          function require(condition) {
            if (!condition) {
              throw new Error('Condition is falsy');
            }
          }
          const foo = require('foo');
          console.log(foo.test);
        `,
        snapshot: false,
      },

    'does not transform require calls if require is redeclared in the global scope':
      {
        code: `
          function require(condition) {
            if (!condition) {
              throw new Error('Condition is falsy');
            }
          }
          function test() {
            const foo = require('foo');
            console.log(foo.test);
          }
        `,
        snapshot: false,
      },

    'does not transform require calls if it is not needed': {
      code: `
        function test () {
          function require(condition) {
            if (!condition) {
              throw new Error('The condition is false');
            }
          }

          require('test');
        }
      `,
      snapshot: true,
    },

    'inlines requires that are referenced before the require statement': {
      code: [
        'function foo() {',
        '  bar();',
        '}',
        'var bar = require("baz");',
        'foo();',
        'bar();',
      ].join('\n'),
      snapshot: true,
    },

    'inlines require properties': {
      code: [
        'var tmp = require("./a");',
        'var a = tmp.a',
        'var D = {',
        '  b: function(c) { c ? a(c.toString()) : a("No c!"); },',
        '};',
      ].join('\n'),
      snapshot: true,
    },

    'ignores require properties (as identifiers) that are re-assigned': {
      code: [
        'var X = require("X");',
        'var origA = X.a',
        'X.a = function() {',
        '  origA();',
        '};',
      ].join('\n'),
      snapshot: true,
    },

    'ignores require properties (as strings) that are re-assigned': {
      code: [
        'var X = require("X");',
        'var origA = X["a"]',
        'X["a"] = function() {',
        '  origA();',
        '};',
      ].join('\n'),
      snapshot: true,
    },

    'inlines functions provided via `inlineableCalls`': {
      code: [
        'const inlinedCustom = customStuff("foo");',
        'const inlinedRequire = require("bar");',
        '',
        'inlinedCustom();',
        'inlinedRequire();',
      ].join('\n'),
      snapshot: true,
    },

    'ignores requires in `ignoredRequires`': {
      code: ['const CommonFoo = require("CommonFoo");', 'CommonFoo();'].join(
        '\n',
      ),
      snapshot: false,
    },

    'ignores destructured properties of requires in `ignoredRequires`': {
      code: [
        'const tmp = require("CommonFoo");',
        'const a = require("CommonFoo").a;',
        'a();',
      ].join('\n'),
      snapshot: false,
    },

    'inlines require.resolve calls': {
      code: ['const a = require(require.resolve("Foo")).bar;', '', 'a();'].join(
        '\n',
      ),
      snapshot: true,
    },

    'inlines with multiple arguments': {
      code: ['const a = require("Foo", "Bar", 47);', '', 'a();'].join('\n'),
      snapshot: true,
    },
  },
});

describe('inline-requires', () => {
  const transform = (source, options) =>
    babel.transform(source.join('\n'), {
      ast: true,
      compact: true,
      plugins: [
        [require('@babel/plugin-transform-modules-commonjs'), {strict: false}],
        [inlineRequiresPlugin, options],
      ],
    });

  const compare = (input, output, options) => {
    expect(transform(input, options).code).toBe(
      transform(output, options).code,
    );
  };

  it('should be compatible with other transforms like transform-modules-commonjs', function () {
    compare(
      ['import Imported from "foo";', 'console.log(Imported);'],
      [
        'var _foo = _interopRequireDefault(require("foo"));',
        'function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }',
        'console.log(_foo.default);',
      ],
    );
  });

  it('should be compatible with `transform-modules-commonjs` when using named imports', function () {
    compare(
      [
        'import {a} from "./a";',
        'var D = {',
        '  b: function(c) { c ? a(c.toString()) : a("No c!"); },',
        '};',
      ],
      [
        'var D = {',
        '  b: function (c) {',
        '    c ? (0, require("./a").a)(c.toString()) : (0, require("./a").a)("No c!");',
        '  }',
        '};',
      ],
    );
  });

  it('should remove loc information from nodes', function () {
    const ast = transform(['var x = require("x"); x']).ast;
    const expression = ast.program.body[0].expression;

    function expectNoLocation(node) {
      expect(node.start).toBeUndefined();
      expect(node.end).toBeUndefined();
      expect(node.loc).toBeUndefined();
    }

    expectNoLocation(expression);
    expectNoLocation(expression.arguments[0]);
  });

  it('should not emit duplicate nodes', function () {
    const ast = transform([
      'var foo = require("foo");',
      'foo.bar()',
      'foo.baz()',
    ]).ast;
    validateOutputAst(ast);
  });
});
