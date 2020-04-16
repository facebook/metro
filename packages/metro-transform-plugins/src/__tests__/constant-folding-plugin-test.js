/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 * @flow
 */

'use strict';

const constantFoldingPlugin = require('../constant-folding-plugin');
const nullishCoalescingOperatorPlugin = require('@babel/plugin-syntax-nullish-coalescing-operator')
  .default;

const {compare} = require('../__mocks__/test-helpers');

describe('constant expressions', () => {
  it('can optimize conditional expressions with constant conditions', () => {
    const code = `
      a(
        'production' == "production",
        'production' !== 'development',
        false && 1 || 0 || 2,
        true || 3,
        'android' === 'ios' ? null : {},
        'android' === 'android' ? {a: 1} : {a: 0},
        'foo' === 'bar' ? b : c,
        f() ? g() : h(),
      );
    `;

    const expected = `
      a(true, true, 2, true, {}, {a: 1}, c, f() ? g() : h());
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  it('can optimize ternary expressions with constant conditions', () => {
    const code = `
       var a = true ? 1 : 2;
       var b = 'android' == 'android'
         ? ('production' != 'production' ? 'a' : 'A')
         : 'i';
    `;

    const expected = `
      var a = 1;
      var b = 'A';
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  it('can optimize logical operator expressions with constant conditions', () => {
    const code = `
      var a = true || 1;
      var b = 'android' == 'android' &&
        'production' != 'production' || null || "A";
    `;

    const expected = `
      var a = true;
      var b = "A";
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  it('can optimize logical operators with partly constant operands', () => {
    const code = `
      var a = "truthy" || z();
      var b = "truthy" && z();
      var c = null && z();
      var d = null || z();
      var e = !1 && z();
      var f = z() && undefined || undefined;
    `;

    const expected = `
      var a = "truthy";
      var b = z();
      var c = null;
      var d = z();
      var e = false;
      var f = z() && undefined || undefined;
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  it('folds null coalescing operator', () => {
    const code = `
      var a = undefined ?? u();
      var b = null ?? v();
      var c = false ?? w();
      var d = 0 ?? x();
      var e = NaN ?? x();
      var f = "truthy" ?? z();
    `;

    const expected = `
      var a = u();
      var b = v();
      var c = false;
      var d = 0;
      var e = NaN;
      var f = "truthy";
    `;

    compare(
      [constantFoldingPlugin, nullishCoalescingOperatorPlugin],
      code,
      expected,
    );
  });

  it('can remode an if statement with a falsy constant test', () => {
    const code = `
      if ('production' === 'development' || false) {
        var a = 1;
      }
    `;

    compare([constantFoldingPlugin], code, '');
  });

  it('can optimize if-else-branches with constant conditions', () => {
    const code = `
      if ('production' == 'development') {
        var a = 1;
        var b = a + 2;
      } else if ('development' == 'development') {
        var a = 3;
        var b = a + 4;
      } else {
        var a = 'b';
      }
    `;

    const expected = `
      {
        var a = 3;
        var b = 7;
      }
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  it('can optimize nested if-else constructs', () => {
    const code = `
      if ('ios' === "android") {
        if (true) {
          require('a');
        } else {
          require('b');
        }
      } else if ('android' === 'android') {
        if (true) {
          require('c');
        } else {
          require('d');
        }
      }
    `;

    const expected = `
      {
        {
          require('c');
        }
      }
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  it('folds if expressions with variables', () => {
    const code = `
      var x = 3;

      if (x - 3) {
        require('a');
      }
    `;

    const expected = `
      var x = 3;
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  it('folds logical expressions with variables', () => {
    const code = `
      var x = 3;
      var y = (x - 3) || 4;
      var z = (y - 4) && 4;
    `;

    const expected = `
      var x = 3;
      var y = 4;
      var z = 0;
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  it('wipes unused functions', () => {
    const code = `
      var xUnused = function () {
        console.log(100);
      };

      var yUnused = () => {
        console.log(200);
      };

      function zUnused() {
        console.log(300);
      }

      var xUsed = () => {
        console.log(400);
      };

      var yUsed = function () {
        console.log(500);
      };

      function zUsed() {
        console.log(600);
      }

      (() => {
        console.log(700);
      })();

      xUsed();
      yUsed();
      zUsed();
    `;

    const expected = `
      var xUsed = () => {
        console.log(400);
      };

      var yUsed = function() {
        console.log(500);
      };

      function zUsed() {
        console.log(600);
      }

      (() => {
        console.log(700);
      })();

      xUsed();
      yUsed();
      zUsed();
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  it('recursively strips off functions', () => {
    const code = `
      function x() {}

      if (false) {
        x();
      }
    `;

    compare([constantFoldingPlugin], code, '');
  });

  it('verifies that mixes of variables and functions properly minifies', () => {
    const code = `
      var x = 2;
      var y = () => x - 2;

      if (x) {
        z();
      }
    `;

    const expected = `
      var x = 2;

      {
        z();
      }
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  it('does not mess up with negative numbers', () => {
    const code = `
      var plusZero = +0;
      var zero = 0;
      var minusZero = -0;
      var plusOne = +1;
      var one = 1;
      var minusOne = -1;
    `;

    const expected = `
      var plusZero = 0;
      var zero = 0;
      var minusZero = -0;
      var plusOne = 1;
      var one = 1;
      var minusOne =- 1;
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  it('does not mess up default exports', () => {
    const nonChanged = [
      'export default function () {}',
      'export default () => {}',
      'export default class {}',
      'export default 1',
    ];

    nonChanged.forEach((test: string) =>
      compare([constantFoldingPlugin], test, test),
    );
  });

  it('will not throw on evaluate exception', () => {
    const nonChanged = `
      Object({ 'toString': 0 } + '');
    `;

    compare([constantFoldingPlugin], nonChanged, nonChanged);
  });
});
