/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

const normalizePseudoglobals = require('../normalizePseudoGlobals');
const {transformFromAstSync, transformSync} = require('@babel/core');

function normalizePseudoglobalsCall(source, options) {
  const {ast} = transformSync(source, {
    ast: true,
    babelrc: false,
    browserslistConfigFile: false,
    code: false,
    compact: false,
    configFile: false,
    sourceType: 'module',
  });

  const reserved = normalizePseudoglobals(ast, options);

  const {code} = transformFromAstSync(ast, source, {
    ast: false,
    babelrc: false,
    browserslistConfigFile: false,
    code: true,
    compact: false,
    configFile: false,
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
          const r = 1; // _$$_REQUIRE will be renamed to "_r".
          return r++;
        }
      })();

      (function() {
        var global = 'potato';
        return global + 'tomato';
      })();
    })
  `);

  expect(result.reserved).toEqual(['g', '_r', 'm', 'e', 'd']);
  expect(result.code).toMatchInlineSnapshot(`
    "__d(function (g, _r, m, e, d) {
      _r(27).foo();
      (function () {
        {
          const r = 1; // _$$_REQUIRE will be renamed to \\"_r\\".
          return r++;
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

it('avoids renaming parameters appearing in reservedNames', () => {
  const result = normalizePseudoglobalsCall(
    `
      __d(function (renameMe, doNotRenameMe) {
        renameMe();
        doNotRenameMe();
      })
    `,
    {reservedNames: ['doNotRenameMe']},
  );

  expect(result.reserved).toMatchInlineSnapshot(`
    Array [
      "r",
    ]
  `);
  expect(result.code).toMatchInlineSnapshot(`
    "__d(function (r, doNotRenameMe) {
      r();
      doNotRenameMe();
    });"
  `);
});

it('throws if a reserved name collides with a short name', () => {
  expect(() =>
    normalizePseudoglobalsCall(
      `
        __d(function (require, r) {
          require();
          r();
        })
      `,
      {reservedNames: ['r']},
    ),
  ).toThrowErrorMatchingInlineSnapshot(
    `"Could not reserve the identifier r because it is the short name for require"`,
  );
});
