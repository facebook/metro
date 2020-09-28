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

const JsFileWrapping = require('../JsFileWrapping');

const babylon = require('@babel/parser');

const {codeFromAst, comparableCode} = require('../../test-helpers');

const {WRAP_NAME} = JsFileWrapping;
// Note; it's not important HOW Babel changes the name. Only THAT it does.
// At the time of writing, it will prefix an underscore for our first rename
const BABEL_RENAMED = '_' + WRAP_NAME;
const BABEL_RENAMED2 = '_' + WRAP_NAME + '2';

const defaultGlobalPrefix = '';

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
    '_$$_IMPORT_DEFAULT',
    '_$$_IMPORT_ALL',
    dependencyMapName,
    defaultGlobalPrefix,
  );

  expect(requireName).toBe(BABEL_RENAMED);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      __d(function (global, ${BABEL_RENAMED}, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMapName) {
        const dynamicRequire = ${BABEL_RENAMED};
        const a = ${BABEL_RENAMED}('b/lib/a');
        exports.do = () => ${BABEL_RENAMED}("do");
        if (!something) {
          ${BABEL_RENAMED}("setup/something");
        }
        ${BABEL_RENAMED}.blah('do');
      });`),
  );
});

it('wraps a module correctly with global prefix', () => {
  const dependencyMapName = '_dependencyMapName';

  const originalAst = astFromCode(`
    const dynamicRequire = require;
  `);
  const globalPrefix = '__metro';
  const {ast, requireName} = JsFileWrapping.wrapModule(
    originalAst,
    '_$$_IMPORT_DEFAULT',
    '_$$_IMPORT_ALL',
    dependencyMapName,
    globalPrefix,
  );

  expect(requireName).toBe(BABEL_RENAMED);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      ${globalPrefix}__d(function (global, ${BABEL_RENAMED}, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMapName) {
        const dynamicRequire = ${BABEL_RENAMED};
      });`),
  );
});

describe('safe renaming of require', () => {
  ['let', 'const', 'var'].forEach((declKeyword: string) => {
    describe('decl type = ' + declKeyword, () => {
      it('original name will always be renamed so local decl should be fine', () => {
        const dependencyMapName = '_dependencyMapName';

        const originalAst = astFromCode(`
          const dynamicRequire = require;
          const a = require('b/lib/a');
          ${declKeyword} ${WRAP_NAME} = 'foo';
          exports.do = () => require("do");
          if (!something) {
            require("setup/something");
          }
          require.blah('do');
        `);
        const {ast, requireName} = JsFileWrapping.wrapModule(
          originalAst,
          '_$$_IMPORT_DEFAULT',
          '_$$_IMPORT_ALL',
          dependencyMapName,
          defaultGlobalPrefix,
        );

        expect(requireName).toBe(BABEL_RENAMED);
        expect(codeFromAst(ast)).toEqual(
          comparableCode(`
            __d(function (global, ${BABEL_RENAMED}, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMapName) {
              const dynamicRequire = ${BABEL_RENAMED};
              const a = ${BABEL_RENAMED}('b/lib/a');
              ${declKeyword} ${WRAP_NAME} = 'foo';
              exports.do = () => ${BABEL_RENAMED}("do");
              if (!something) {
                ${BABEL_RENAMED}("setup/something");
              }
              ${BABEL_RENAMED}.blah('do');
            });`),
        );
      });

      it('when the scope has the new name defined too', () => {
        const dependencyMapName = '_dependencyMapName';

        const originalAst = astFromCode(`
          const dynamicRequire = require;
          const a = require('b/lib/a');
          ${declKeyword} ${BABEL_RENAMED} = 'foo';
          exports.do = () => require("do");
          if (!something) {
            require("setup/something");
          }
          require.blah('do');
        `);
        const {ast, requireName} = JsFileWrapping.wrapModule(
          originalAst,
          '_$$_IMPORT_DEFAULT',
          '_$$_IMPORT_ALL',
          dependencyMapName,
          defaultGlobalPrefix,
        );

        expect(requireName).toBe(BABEL_RENAMED2);
        expect(codeFromAst(ast)).toEqual(
          comparableCode(`
            __d(function (global, ${BABEL_RENAMED2}, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMapName) {
              const dynamicRequire = ${BABEL_RENAMED2};
              const a = ${BABEL_RENAMED2}('b/lib/a');
              ${declKeyword} ${BABEL_RENAMED} = 'foo';
              exports.do = () => ${BABEL_RENAMED2}("do");
              if (!something) {
                ${BABEL_RENAMED2}("setup/something");
              }
              ${BABEL_RENAMED2}.blah('do');
            });`),
        );
      });

      it('when an inner scope already has the new name defined too', () => {
        const dependencyMapName = '_dependencyMapName';

        // Note; it's not important HOW Babel changes the name. Only THAT it does.
        const BABEL_RENAMED = '_' + WRAP_NAME;

        const originalAst = astFromCode(`
          const dynamicRequire = require;
          const a = require('b/lib/a');
          if (a) {
            (function () {
              ${declKeyword} ${BABEL_RENAMED} = require('dingus');
              a(${BABEL_RENAMED}(dynamicRequire));
            })
          }
        `);
        const {ast, requireName} = JsFileWrapping.wrapModule(
          originalAst,
          '_$$_IMPORT_DEFAULT',
          '_$$_IMPORT_ALL',
          dependencyMapName,
          defaultGlobalPrefix,
        );

        expect(requireName).toBe(BABEL_RENAMED2);
        expect(codeFromAst(ast)).toEqual(
          comparableCode(`
            __d(function (global, ${BABEL_RENAMED2}, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMapName) {
              const dynamicRequire = ${BABEL_RENAMED2};
              const a = ${BABEL_RENAMED2}('b/lib/a');
              if (a) {
                (function () {
                  ${declKeyword} ${BABEL_RENAMED} = ${BABEL_RENAMED2}('dingus');
                  a(${BABEL_RENAMED}(dynamicRequire));
                });
              }
            });`),
        );
      });
    });
  });
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
      })(typeof globalThis !== 'undefined' ?
          globalThis :
          typeof global !== 'undefined' ?
          global :
          typeof window !== 'undefined' ? window : this);`),
  );
});

it('wraps a JSON file correctly', () => {
  const source = JSON.stringify(
    {
      foo: 'foo',
      bar: 'bar',
      baz: true,
      qux: null,
      arr: [1, 2, 3, 4],
    },
    null,
    2,
  );

  const wrappedJson = JsFileWrapping.wrapJson(source, defaultGlobalPrefix);

  expect(comparableCode(wrappedJson)).toEqual(
    comparableCode(
      `__d(function(global, require, _importDefaultUnused, _importAllUnused, module, exports, _dependencyMapUnused) {
      module.exports = {
        "foo": "foo",
        "bar": "bar",
        "baz": true,
        "qux": null,
        "arr": [
          1,
          2,
          3,
          4
        ]
      };
    });`,
    ),
  );
});

function astFromCode(code: string) {
  return babylon.parse(code, {
    plugins: ['dynamicImport'],
    sourceType: 'script',
  });
}
