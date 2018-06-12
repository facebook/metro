/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 * @flow
 */
'use strict';

const constantFoldingPlugin = require('../constant-folding-plugin');

const {transformSync} = require('@babel/core');
const {transformFromAstSync} = require('@babel/core');

import type {TransformResult} from '@babel/core';

function constantFolding(
  filename: string,
  transformResult: TransformResult,
): TransformResult {
  return transformFromAstSync(transformResult.ast, transformResult.code, {
    ast: false,
    babelrc: false,
    compact: true,
    filename,
    inputSourceMap: transformResult.map || undefined, // may not be null
    plugins: [constantFoldingPlugin],
    retainLines: true,
    sourceFileName: filename,
    sourceMaps: true,
    sourceType: 'module',
  });
}

function parse(code: string): TransformResult {
  return transformSync(code, {
    ast: true,
    babelrc: false,
    code: false,
    compact: true,
    plugins: [require('@babel/plugin-syntax-nullish-coalescing-operator')],
    sourceMaps: true,
    sourceType: 'module',
  });
}

function normalize({code}): string {
  if (code == null) {
    return 'FAIL';
  }
  return transformSync(code, {
    ast: false,
    babelrc: false,
    compact: true,
    retainLines: false,
    sourceType: 'module',
  }).code;
}

function fold(filename, code): string {
  const p = parse(code);
  return normalize(constantFolding(filename, p));
}

describe('constant expressions', () => {
  it('can optimize conditional expressions with constant conditions', () => {
    const code = `
      a(
        'production'=="production",
        'production'!=='development',
        false && 1 || 0 || 2,
        true || 3,
        'android'==='ios' ? null : {},
        'android'==='android' ? {a:1} : {a:0},
        'foo'==='bar' ? b : c,
        f() ? g() : h()
      );`;
    expect(fold('arbitrary.js', code)).toEqual(
      'a(true,true,2,true,{},{a:1},c,f()?g():h());',
    );
  });

  it('can optimize ternary expressions with constant conditions', () => {
    const code = `var a = true ? 1 : 2;
       var b = 'android' == 'android'
         ? ('production' != 'production' ? 'a' : 'A')
         : 'i';`;
    expect(fold('arbitrary.js', code)).toEqual("var a=1;var b='A';");
  });

  it('can optimize logical operator expressions with constant conditions', () => {
    const code = `
      var a = true || 1;
      var b = 'android' == 'android' &&
        'production' != 'production' || null || "A";`;
    expect(fold('arbitrary.js', code)).toEqual('var a=true;var b="A";');
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
    expect(fold('arbitrary.js', code)).toEqual(
      'var a="truthy";var b=z();var c=null;var d=z();var e=false;var f=z()&&undefined||undefined;',
    );
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
    expect(fold('arbitrary.js', code)).toEqual(
      'var a=u();var b=v();var c=false;var d=0;var e=NaN;var f="truthy";',
    );
  });

  it('can remode an if statement with a falsy constant test', () => {
    const code = `
      if ('production' === 'development' || false) {
        var a = 1;
      }
    `;
    expect(fold('arbitrary.js', code)).toEqual('');
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
    expect(fold('arbitrary.js', code)).toEqual('{var a=3;var b=7;}');
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
    expect(fold('arbitrary.js', code)).toEqual("{{require('c');}}");
  });

  it('folds if expressions with variables', () => {
    const code = `
      var x = 3;

      if (x - 3) {
        require('a');
      }
    `;

    expect(fold('arbitrary.js', code)).toEqual('var x=3;');
  });

  it('folds logical expressions with variables', () => {
    const code = `
      var x = 3;
      var y = (x - 3) || 4;
      var z = (y - 4) && 4;
    `;

    expect(fold('arbitrary.js', code)).toEqual('var x=3;var y=4;var z=0;');
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

    expect(fold('arbitrary.js', code)).toEqual(
      [
        'var xUsed=()=>{console.log(400);};',
        'var yUsed=function(){console.log(500);};',
        'function zUsed(){console.log(600);}',
        '(()=>{console.log(700);})();',
        'xUsed();',
        'yUsed();',
        'zUsed();',
      ].join(''),
    );
  });

  it('recursively strips off functions', () => {
    const code = `
      function x() {}

      if (false) {
        x();
      }
    `;

    expect(fold('arbitrary.js', code)).toEqual('');
  });

  it('verifies that mixes of variables and functions properly minifies', () => {
    const code = `
      var x = 2;
      var y = () => x - 2;

      if (x) {
        z();
      }
    `;

    expect(fold('arbitrary.js', code)).toEqual('var x=2;{z();}');
  });

  it('does not mess up -0', () => {
    const code = `
      var plusZero = +0;
      var zero = 0;
      var minusZero = -0;
    `;

    expect(fold('arbitrary.js', code)).toEqual(
      'var plusZero=0;var zero=0;var minusZero=-0;',
    );
  });

  it('does not mess up default exports', () => {
    let code = 'export default function () {}';
    expect(fold('arbitrary.js', code)).toEqual('export default function(){}');
    code = 'export default () => {}';
    expect(fold('arbitrary.js', code)).toEqual('export default(()=>{});');
    code = 'export default class {}';
    expect(fold('arbitrary.js', code)).toEqual('export default class{}');
    code = 'export default 1';
    expect(fold('arbitrary.js', code)).toEqual('export default 1;');
  });
});
