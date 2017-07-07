/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 */
'use strict';

/* eslint-disable max-len */

const constantFolding = require('../constant-folding');

const {transform, transformFromAst} = require('babel-core');

const babelOptions = {
  babelrc: false,
  compact: true,
};

function toString(ast) {
  return normalize(transformFromAst(ast, babelOptions).code);
}

function normalize(code) {
  return transform(code, babelOptions).code;
}

describe('constant expressions', () => {
  it('can optimize conditional expressions with constant conditions', () => {
    const before = `
      a(
        'production'=="production",
        'production'!=='development',
        false && 1 || 0 || 2,
        true || 3,
        'android'==='ios' ? null : {},
        'android'==='android' ? {a:1} : {a:0},
        'foo'==='bar' ? b : c,
        f() ? g() : h()
      );
    `;

    const after = `
      a(
        true,
        true,
        2,
        true,
        {},
        {a:1},
        c,
        f() ? g() : h()
      );
    `;

    const {ast} = constantFolding('arbitrary.js', {code: before});
    expect(toString(ast)).toEqual(normalize(after));
  });

  it('can optimize ternary expressions with constant conditions', () => {
    const before = `
      var a = true ? 1 : 2;
      var b = 'android' == 'android'
        ? ('production' != 'production' ? 'a' : 'A')
        : 'i';
    `;

    const after = `
      var a = 1;
      var b = 'A';
    `;

    const {ast} = constantFolding('arbitrary.js', {code: before});
    expect(toString(ast)).toEqual(normalize(after));
  });

  it('can optimize logical operator expressions with constant conditions', () => {
    const before = `
      var a = true || 1;
      var b = 'android' == 'android' &&
        'production' != 'production' || null || "A";
    `;

    const after = `
      var a = true;
      var b = "A";
    `;

    const {ast} = constantFolding('arbitrary.js', {code: before});
    expect(toString(ast)).toEqual(normalize(after));
  });

  it('can optimize logical operators with partly constant operands', () => {
    const before = `
      var a = "truthy" || z();
      var b = "truthy" && z();
      var c = null && z();
      var d = null || z();
      var e = !1 && z();
    `;

    const after = `
      var a = "truthy";
      var b = z();
      var c = null;
      var d = z();
      var e = false;
    `;

    const {ast} = constantFolding('arbitrary.js', {code: before});
    expect(toString(ast)).toEqual(normalize(after));
  });

  it('can remode an if statement with a falsy constant test', () => {
    const before = `
      if ('production' === 'development' || false) {
        var a = 1;
      }
    `;

    // Intentionally empty: all dead code.
    const after = `
    `;

    const {ast} = constantFolding('arbitrary.js', {code: before});
    expect(toString(ast)).toEqual(normalize(after));
  });

  it('can optimize if-else-branches with constant conditions', () => {
    const before = `
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

    const after = `
      {
        var a = 3;
        var b = a + 4;
      }
    `;

    const {ast} = constantFolding('arbitrary.js', {code: before});
    expect(toString(ast)).toEqual(normalize(after));
  });

  it('can optimize nested if-else constructs', () => {
    const before = `
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

    const after = `
      {
        {
          require('c');
        }
      }
    `;

    const {ast} = constantFolding('arbitrary.js', {code: before});
    expect(toString(ast)).toEqual(normalize(after));
  });
});
