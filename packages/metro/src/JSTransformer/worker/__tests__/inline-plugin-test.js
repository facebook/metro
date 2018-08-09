/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+js_foundation
 * @flow
 * @format
 */
'use strict';

const inlinePlugin = require('../inline-plugin');
const invariant = require('fbjs/lib/invariant');

const {transformSync} = require('@babel/core');
const {transformFromAstSync} = require('@babel/core');

import type {TransformResult} from '@babel/core';
import type {Ast} from 'babel-core';
import type {BabelSourceMap} from 'babel-core';

const babelOptions = {
  babelrc: false,
  compact: true,
};

type AstResult = {
  ast: Ast,
  code: ?string,
  map: ?BabelSourceMap,
};

function inline(
  filename: string,
  transformResult: {ast?: ?Ast, code: string, map?: ?BabelSourceMap},
  options: {+dev?: boolean, +platform?: ?string},
): AstResult {
  const code = transformResult.code;
  const babelOptions = {
    babelrc: false,
    code: false,
    compact: true,
    filename,
    inputSourceMap: transformResult.map,
    plugins: [[inlinePlugin, options]],
    sourceFileName: filename,
    sourceMaps: true,
    sourceType: 'module',
  };

  const result = transformResult.ast
    ? transformFromAstSync(transformResult.ast, code, {
        ...babelOptions,
        ast: true,
      })
    : transformSync(code, {...babelOptions, ast: true});
  const {ast} = result;
  invariant(ast != null, 'Missing AST in babel transform results.');
  return {ast, code: result.code, map: result.map};
}

function toString(ast): string {
  return normalize(
    transformFromAstSync(ast, '(unused)', {...babelOptions, ast: false}).code,
  );
}

function normalize(code: string): string {
  return transformSync(code, {...babelOptions, ast: false}).code;
}

function toAst(code: string): TransformResult {
  return transformSync(code, {...babelOptions, ast: true, code: false}).ast;
}

describe('inline constants', () => {
  it('replaces __DEV__ in the code', () => {
    const code = `function a() {
      var a = __DEV__ ? 1 : 2;
      var b = a.__DEV__;
      var c = function __DEV__(__DEV__) {};
    }`;
    const {ast} = inline('arbitrary.js', {code}, {dev: true});
    expect(toString(ast)).toEqual(normalize(code.replace(/__DEV__/, 'true')));
  });

  it("doesn't replace a local __DEV__ variable", () => {
    const code = `function a() {
      var __DEV__ = false;
      var a = __DEV__ ? 1 : 2;
    }`;
    const {ast} = inline('arbitrary.js', {code}, {dev: true});
    expect(toString(ast)).toEqual(normalize(code));
  });

  it('replaces Platform.OS in the code if Platform is a global', () => {
    const code = `function a() {
      var a = Platform.OS;
      var b = a.Platform.OS;
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/Platform\.OS/, '"ios"')),
    );
  });

  it('replaces Platform.OS in the code if Platform is a top level import', () => {
    const code = `
      var Platform = require('Platform');
      function a() {
        if (Platform.OS === 'android') a = function() {};
        var b = a.Platform.OS;
      }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/Platform\.OS/, '"ios"')),
    );
  });

  it('replaces Platform.OS in the code if Platform is a top level import from react-native', () => {
    const code = `
      var Platform = require('react-native').Platform;
      function a() {
        if (Platform.OS === 'android') a = function() {};
        var b = a.Platform.OS;
      }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/Platform\.OS/, '"ios"')),
    );
  });

  it('replaces require("Platform").OS in the code', () => {
    const code = `function a() {
      var a = require('Platform').OS;
      var b = a.require('Platform').OS;
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'android'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/require\('Platform'\)\.OS/, '"android"')),
    );
  });

  it('replaces React.Platform.OS in the code if React is a global', () => {
    const code = `function a() {
      var a = React.Platform.OS;
      var b = a.React.Platform.OS;
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/React\.Platform\.OS/, '"ios"')),
    );
  });

  it('replaces ReactNative.Platform.OS in the code if ReactNative is a global', () => {
    const code = `function a() {
      var a = ReactNative.Platform.OS;
      var b = a.ReactNative.Platform.OS;
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/ReactNative\.Platform\.OS/, '"ios"')),
    );
  });

  it('replaces React.Platform.OS in the code if React is a top level import', () => {
    const code = `
      var React = require('React');
      function a() {
        if (React.Platform.OS === 'android') a = function() {};
        var b = a.React.Platform.OS;
      }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/React.Platform\.OS/, '"ios"')),
    );
  });

  it('replaces require("React").Platform.OS in the code', () => {
    const code = `function a() {
      var a = require('React').Platform.OS;
      var b = a.require('React').Platform.OS;
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'android'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/require\('React'\)\.Platform\.OS/, '"android"')),
    );
  });

  it('replaces ReactNative.Platform.OS in the code if ReactNative is a top level import', () => {
    const code = `
      var ReactNative = require('react-native');
      function a() {
        if (ReactNative.Platform.OS === 'android') a = function() {};
        var b = a.ReactNative.Platform.OS;
      }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'android'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/ReactNative.Platform\.OS/, '"android"')),
    );
  });

  it('replaces require("react-native").Platform.OS in the code', () => {
    const code = `function a() {
      var a = require('react-native').Platform.OS;
      var b = a.require('react-native').Platform.OS;
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'android'});
    expect(toString(ast)).toEqual(
      normalize(
        code.replace(/require\('react-native'\)\.Platform\.OS/, '"android"'),
      ),
    );
  });

  it('inlines Platform.select in the code if Platform is a global and the argument is an object literal', () => {
    const code = `function a() {
      var a = Platform.select({ios: 1, android: 2});
      var b = a.Platform.select({ios: 1, android: 2});
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/Platform\.select[^;]+/, '1')),
    );
  });

  it("inlines Platform.select in the code if Platform is a global and the argument doesn't have target platform in it's keys", () => {
    const code = `function a() {
      var a = Platform.select({ios: 1, default: 2});
      var b = a.Platform.select({ios: 1, default: 2});
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'android'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/Platform\.select[^;]+/, '2')),
    );
  });

  it('inlines Platform.select in the code when using string keys', () => {
    const code = `function a() {
      var a = Platform.select({'ios': 1, 'android': 2});
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'android'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/Platform\.select[^;]+/, '2')),
    );
  });

  it('does not inline Platform.select in the code when some of the properties are dynamic', () => {
    const code = `function a() {
      const COMPUTED_IOS = 'ios';
      const COMPUTED_ANDROID = 'android';
      var a = Platform.select({[COMPUTED_ANDROID]: 1, [COMPUTED_IOS]: 2, default: 3});
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'android'});
    expect(toString(ast)).toEqual(normalize(code));
  });

  it('does not inline Platform.select when all properties are dynamic', () => {
    const code = `function a() {
      var a = Platform.select({[COMPUTED_ANDROID]: 1, [COMPUTED_IOS]: 2});
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'android'});
    expect(toString(ast)).toEqual(normalize(code));
  });

  it('does not inline Platform.select if it receives a non-object', () => {
    const code = `function a() {
      var a = Platform.select(foo);
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'android'});
    expect(toString(ast)).toEqual(normalize(code));
  });

  it('replaces Platform.select in the code if Platform is a top level import', () => {
    const code = `
      var Platform = require('Platform');
      function a() {
        Platform.select({ios: 1, android: 2});
        var b = a.Platform.select({});
      }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'android'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/Platform\.select[^;]+/, '2')),
    );
  });

  it('replaces Platform.select in the code if Platform is a top level import from react-native', () => {
    const code = `
      var Platform = require('react-native').Platform;
      function a() {
        Platform.select({ios: 1, android: 2});
        var b = a.Platform.select({});
      }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/Platform\.select[^;]+/, '1')),
    );
  });

  it('replaces require("Platform").select in the code', () => {
    const code = `function a() {
      var a = require('Platform').select({ios: 1, android: 2});
      var b = a.require('Platform').select({});
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'android'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/Platform\.select[^;]+/, '2')),
    );
  });

  it('replaces React.Platform.select in the code if React is a global', () => {
    const code = `function a() {
      var a = React.Platform.select({ios: 1, android: 2});
      var b = a.React.Platform.select({});
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/React\.Platform\.select[^;]+/, '1')),
    );
  });

  it('replaces ReactNative.Platform.select in the code if ReactNative is a global', () => {
    const code = `function a() {
      var a = ReactNative.Platform.select({ios: 1, android: 2});
      var b = a.ReactNative.Platform.select({});
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/ReactNative\.Platform\.select[^;]+/, '1')),
    );
  });

  it('replaces React.Platform.select in the code if React is a top level import', () => {
    const code = `
      var React = require('React');
      function a() {
        var a = React.Platform.select({ios: 1, android: 2});
        var b = a.React.Platform.select({});
      }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/React\.Platform\.select[^;]+/, '1')),
    );
  });

  it('replaces require("React").Platform.select in the code', () => {
    const code = `function a() {
      var a = require('React').Platform.select({ios: 1, android: 2});
      var b = a.require('React').Platform.select({});
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'android'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/require\('React'\)\.Platform\.select[^;]+/, '2')),
    );
  });

  it('replaces ReactNative.Platform.select in the code if ReactNative is a top level import', () => {
    const code = `
      var ReactNative = require('react-native');
      function a() {
        var a = ReactNative.Plaftform.select({ios: 1, android: 2});
        var b = a.ReactNative.Platform.select;
      }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'android'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/ReactNative.Platform\.select[^;]+/, '2')),
    );
  });

  it('replaces require("react-native").Platform.select in the code', () => {
    const code = `
      var a = require('react-native').Platform.select({ios: 1, android: 2});
      var b = a.require('react-native').Platform.select({});
    `;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'android'});
    expect(toString(ast)).toEqual(
      normalize(
        code.replace(/require\('react-native'\)\.Platform\.select[^;]+/, '2'),
      ),
    );
  });

  it("doesn't replace Platform.OS in the code if Platform is the left hand side of an assignment expression", () => {
    const code = `function a() {
      Platform.OS = "test"
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});

    expect(toString(ast)).toEqual(normalize(code));
  });

  it('replaces Platform.OS in the code if Platform is the right hand side of an assignment expression', () => {
    const code = `function a() {
      var a;
      a = Platform.OS;
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});

    expect(toString(ast)).toEqual(
      normalize(code.replace(/Platform\.OS/, '"ios"')),
    );
  });

  it("doesn't replace React.Platform.OS in the code if Platform is the left hand side of an assignment expression", () => {
    const code = `function a() {
      React.Platform.OS = "test"
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});

    expect(toString(ast)).toEqual(normalize(code));
  });

  it('replaces React.Platform.OS in the code if Platform is the right hand side of an assignment expression', () => {
    const code = `function a() {
      var a;
      a = React.Platform.OS;
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});

    expect(toString(ast)).toEqual(
      normalize(code.replace(/React\.Platform\.OS/, '"ios"')),
    );
  });

  it("doesn't replace ReactNative.Platform.OS in the code if Platform is the left hand side of an assignment expression", () => {
    const code = `function a() {
      ReactNative.Platform.OS = "test"
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});

    expect(toString(ast)).toEqual(normalize(code));
  });

  it('replaces ReactNative.Platform.OS in the code if Platform is the right hand side of an assignment expression', () => {
    const code = `function a() {
      var a;
      a = ReactNative.Platform.OS;
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});

    expect(toString(ast)).toEqual(
      normalize(code.replace(/ReactNative\.Platform\.OS/, '"ios"')),
    );
  });

  it('doesn\'t replace require("React").Platform.OS in the code if Platform is the left hand side of an assignment expression', () => {
    const code = `function a() {
      require("React").Platform.OS = "test"
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});

    expect(toString(ast)).toEqual(normalize(code));
  });

  it('replaces require("React").Platform.OS in the code if Platform is the right hand side of an assignment expression', () => {
    const code = `function a() {
      var a;
      a = require("React").Platform.OS;
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});

    expect(toString(ast)).toEqual(
      normalize(code.replace(/require\("React"\)\.Platform\.OS/, '"ios"')),
    );
  });

  it('replaces non-existing properties with `undefined`', () => {
    const code = 'var a = Platform.select({ios: 1, android: 2})';
    const {ast} = inline('arbitrary.js', {code}, {platform: 'doesnotexist'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/Platform\.select[^;]+/, 'undefined')),
    );
  });

  it('replaces process.env.NODE_ENV in the code', () => {
    const code = `function a() {
      if (process.env.NODE_ENV === 'production') {
        return require('Prod');
      }
      return require('Dev');
    }`;
    const {ast} = inline('arbitrary.js', {code}, {dev: false});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/process\.env\.NODE_ENV/, '"production"')),
    );
  });

  it("doesn't replace process.env.NODE_ENV in the code if NODE_ENV is the right hand side of an assignment expression", () => {
    const code = `function a() {
      process.env.NODE_ENV = 'production';
    }`;
    const {ast} = inline('arbitrary.js', {code}, {dev: false});
    expect(toString(ast)).toEqual(normalize(code));
  });

  it('replaces process.env.NODE_ENV in the code if NODE_ENV is the right hand side of an assignment expression', () => {
    const code = `function a() {
      var env;
      env = process.env.NODE_ENV;
    }`;
    const {ast} = inline('arbitrary.js', {code}, {dev: false});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/process\.env\.NODE_ENV/, '"production"')),
    );
  });

  it('accepts an AST as input', function() {
    const code = 'function ifDev(a,b){return __DEV__?a:b;}';
    const {ast} = inline(
      'arbitrary.hs',
      {ast: toAst(code), code},
      {dev: false},
    );
    expect(toString(ast)).toEqual(code.replace(/__DEV__/, 'false'));
  });

  it('can work with wrapped modules', () => {
    const code = `__arbitrary(function() {
      var Platform = require('react-native').Platform;
      var a = Platform.OS, b = Platform.select({android: 1, ios: 2});
    });`;
    const {ast} = inline(
      'arbitrary',
      {code},
      {dev: true, platform: 'android', isWrapped: true},
    );
    expect(toString(ast)).toEqual(
      normalize(
        code
          .replace(/Platform\.OS/, '"android"')
          .replace(/Platform\.select[^)]+\)/, '1'),
      ),
    );
  });

  it('can work with transformed require calls', () => {
    const code = `__arbitrary(require, function(arbitraryMapName) {
      var a = require(arbitraryMapName[123], 'react-native').Platform.OS;
    });`;
    const {ast} = inline(
      'arbitrary',
      {code},
      {dev: true, platform: 'android', isWrapped: true},
    );
    expect(toString(ast)).toEqual(
      normalize(code.replace(/require\([^)]+\)\.Platform\.OS/, '"android"')),
    );
  });

  it('works with flow-declared variables', () => {
    const stripFlow = require('@babel/plugin-transform-flow-strip-types');
    const code = `declare var __DEV__;
      const a: boolean = __DEV__;`;

    const transformed = transformSync(code, {
      ...babelOptions,
      plugins: [stripFlow, [inlinePlugin, {dev: false}]],
    }).code;

    expect(transformed).toEqual('const a=false;');
  });

  it('works with flow-declared variables in wrapped modules', () => {
    const stripFlow = require('@babel/plugin-transform-flow-strip-types');
    const code = `__d(() => {
      declare var __DEV__;
      const a: boolean = __DEV__;
    });`;

    const transformed = transformSync(code, {
      ...babelOptions,
      plugins: [stripFlow, [inlinePlugin, {dev: true}]],
    }).code;

    expect(transformed).toEqual('__d(()=>{const a=true;});');
  });
});

describe('inline PlatformOS.OS', () => {
  it('replaces PlatformOS.OS in the code if PlatformOS is a top level import', () => {
    const code = `
      var PlatformOS = require('PlatformOS');
      function a() {
        if (PlatformOS.OS === 'android') a = function() {};
        var b = a.PlatformOS.OS;
      }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/PlatformOS\.OS/, '"ios"')),
    );
  });

  it('replaces require("PlatformOS").OS in the code', () => {
    const code = `function a() {
      var a = require('PlatformOS').OS;
      var b = a.require('PlatformOS').OS;
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'android'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/require\('PlatformOS'\)\.OS/, '"android"')),
    );
  });

  it("doesn't replace PlatformOS.OS in the code if PlatformOS is the left hand side of an assignment expression", () => {
    const code = `function a() {
      PlatformOS.OS = "test"
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});

    expect(toString(ast)).toEqual(normalize(code));
  });

  it('replaces PlatformOS.OS in the code if PlatformOS is the right hand side of an assignment expression', () => {
    const code = `function a() {
      var a;
      a = PlatformOS.OS;
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'ios'});

    expect(toString(ast)).toEqual(
      normalize(code.replace(/PlatformOS\.OS/, '"ios"')),
    );
  });
});

describe('inline PlatformOS.select', () => {
  it('replaces PlatformOS.select in the code if PlatformOS is a top level import', () => {
    const code = `
      var PlatformOS = require('PlatformOS');
      function a() {
        PlatformOS.select({ios: 1, android: 2});
        var b = a.PlatformOS.select({});
      }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'android'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/PlatformOS\.select\([^;]+/, '2')),
    );
  });

  it('replaces require("PlatformOS").select in the code', () => {
    const code = `function a() {
      var a = require('PlatformOS').select({ios: 1, android: 2});
      var b = a.require('PlatformOS').select({});
    }`;
    const {ast} = inline('arbitrary.js', {code}, {platform: 'android'});
    expect(toString(ast)).toEqual(
      normalize(code.replace(/PlatformOS\.select\([^;]+/, '2')),
    );
  });
});
