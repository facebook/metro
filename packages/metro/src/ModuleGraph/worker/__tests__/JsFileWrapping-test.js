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

const JsFileWrapping = require('../JsFileWrapping');

const {babylon} = require('../../../babel-bridge');
const {codeFromAst, comparableCode} = require('../../test-helpers');

it('wraps a module correctly', () => {
  const dependencyMapName = '_dependencyMapName';

  const originalAst = astFromCode(`
    const dynamicRequire = require;
    const a = require('b/lib/a');
    exports.do = () => require("do");
    if (!something) {
      require("setup/something");
    }
    require.blah('do');
  `);
  const {ast, requireName} = JsFileWrapping.wrapModule(
    originalAst,
    dependencyMapName,
  );

  expect(requireName).toBe('_require');
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      __d(function (global, _require, module, exports, _dependencyMapName) {
        const dynamicRequire = _require;
        const a = _require('b/lib/a');
        exports.do = () => _require("do");
        if (!something) {
          _require("setup/something");
        }
        _require.blah('do');
      });`),
  );
});

it('replaces the require variable by a unique one', () => {
  const dependencyMapName = '_dependencyMapName';

  const originalAst = astFromCode(`
    const dynamicRequire = require;
    const a = require('b/lib/a');
    let _require = 'foo';
    exports.do = () => require("do");
    if (!something) {
      require("setup/something");
    }
    require.blah('do');
  `);
  const {ast, requireName} = JsFileWrapping.wrapModule(
    originalAst,
    dependencyMapName,
  );

  expect(requireName).toBe('_require2');
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      __d(function (global, _require2, module, exports, _dependencyMapName) {
        const dynamicRequire = _require2;
        const a = _require2('b/lib/a');
        let _require = 'foo';
        exports.do = () => _require2("do");
        if (!something) {
          _require2("setup/something");
        }
        _require2.blah('do');
      });`),
  );
});

it('wraps a polyfill correctly', () => {
  const ast = astFromCode(`
    if (something) {
      console.log('foo');
    }
  `);
  const wrappedAst = JsFileWrapping.wrapPolyfill(ast);

  expect(codeFromAst(wrappedAst)).toEqual(
    comparableCode(`
      (function (global) {
        if (something) {
          console.log('foo');
        }
      })(this);`),
  );
});

function astFromCode(code) {
  return babylon.parse(code, {plugins: ['dynamicImport']});
}
