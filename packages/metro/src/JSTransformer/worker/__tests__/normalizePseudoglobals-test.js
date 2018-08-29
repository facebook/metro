/**
 * Copyright (c) 2018-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

const normalizePseudoglobals = require('../normalizePseudoglobals');

const {transformSync} = require('@babel/core');
const {transformFromAstSync} = require('@babel/core');

function normalizePseudoglobalsCall(source) {
  const {ast} = transformSync(source, {
    ast: true,
    babelrc: false,
    code: false,
    compact: true,
    sourceType: 'module',
  });

  const reserved = normalizePseudoglobals(ast);

  const {code} = transformFromAstSync(ast, {
    ast: false,
    babelrc: false,
    code: true,
    compact: true,
    sourceType: 'module',
  });

  return {code, reserved};
}

it('minimizes arguments given', () => {
  const result = normalizePseudoglobalsCall(`
    __d(function (global, _$$_REQUIRE, module, exports, _dependencyMap) {
      _$$_REQUIRE(27).foo();

      (function() {
        {
          const r = 1; // _$$_REQUIRE will be renamed to "r".
          return r++;
        }
      })();

      (function() {
        var global = 'potato';
        return global + 'tomato';
      })();
    })
  `);

  expect(result.reserved).toEqual(['g', 'r', 'm', 'e', 'd']);
  expect(result.code).toMatchInlineSnapshot(`
"__d(function (g, r, m, e, d) {
  r(27).foo();

  (function () {
    {
      const _r4 = 1; // _$$_REQUIRE will be renamed to \\"r\\".

      return _r4++;
    }
  })();

  (function () {
    var global = 'potato';
    return global + 'tomato';
  })();
});"
`);
});

it('throws if two variables collapse to the same name', () => {
  expect(() =>
    normalizePseudoglobalsCall('__d(function (global, golf) {})'),
  ).toThrow(ReferenceError);
});
