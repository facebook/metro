/**
 * Copyright (c) Facebook, Inc. and its affiliates.
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
const stripFlow = require('@babel/plugin-transform-flow-strip-types');

const {compare} = require('../__mocks__/test-helpers');

describe('inline constants', () => {
  it('replaces __DEV__ in the code', () => {
    const code = `
      function a() {
        var a = __DEV__ ? 1 : 2;
        var b = a.__DEV__;
        var c = function __DEV__(__DEV__) {};
      }
    `;

    compare([inlinePlugin], code, code.replace(/__DEV__/, 'false'), {
      dev: false,
    });
  });

  it("doesn't replace a local __DEV__ variable", () => {
    const code = `
      function a() {
        var __DEV__ = false;
        var a = __DEV__ ? 1 : 2;
      }
    `;

    compare([inlinePlugin], code, code, {dev: false});
  });

  it("doesn't replace __DEV__ in an object property key", () => {
    const code = `
      const x = {
        __DEV__: __DEV__
      };
    `;

    const expected = `
      const x = {
        __DEV__: false
      };
    `;

    compare([inlinePlugin], code, expected, {dev: false});
  });

  it('replaces Platform.OS in the code if Platform is a global', () => {
    const code = `
      function a() {
        var a = Platform.OS;
        var b = a.Platform.OS;
      }
    `;

    compare([inlinePlugin], code, code.replace(/Platform\.OS/, '"ios"'), {
      inlinePlatform: true,
      platform: 'ios',
    });
  });

  it('replaces Platform.OS in the code if Platform is a top level import', () => {
    const code = `
      var Platform = require('Platform');

      function a() {
        if (Platform.OS === 'android') {
          a = function() {};
        }

        var b = a.Platform.OS;
      }
    `;

    compare([inlinePlugin], code, code.replace(/Platform\.OS/, '"ios"'), {
      inlinePlatform: true,
      platform: 'ios',
    });
  });

  it('replaces Platform.OS in the code if Platform is a top level import from react-native', () => {
    const code = `
      var Platform = require('react-native').Platform;

      function a() {
        if (Platform.OS === 'android') {
          a = function() {};
        }

        var b = a.Platform.OS;
      }
    `;

    compare([inlinePlugin], code, code.replace(/Platform\.OS/, '"ios"'), {
      inlinePlatform: true,
      platform: 'ios',
    });
  });

  it('replaces require("Platform").OS in the code', () => {
    const code = `
      function a() {
        var a = require('Platform').OS;
        var b = a.require('Platform').OS;
      }
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/require\('Platform'\)\.OS/, '"android"'),
      {inlinePlatform: true, platform: 'android'},
    );
  });

  it('replaces React.Platform.OS in the code if React is a global', () => {
    const code = `
      function a() {
        var a = React.Platform.OS;
        var b = a.React.Platform.OS;
      }
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/React\.Platform\.OS/, '"ios"'),
      {
        inlinePlatform: 'true',
        platform: 'ios',
      },
    );
  });

  it('replaces ReactNative.Platform.OS in the code if ReactNative is a global', () => {
    const code = `
      function a() {
        var a = ReactNative.Platform.OS;
        var b = a.ReactNative.Platform.OS;
      }
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/ReactNative\.Platform\.OS/, '"ios"'),
      {inlinePlatform: true, platform: 'ios'},
    );
  });

  it('replaces React.Platform.OS in the code if React is a top level import', () => {
    const code = `
      var React = require('React');

      function a() {
        if (React.Platform.OS === 'android') {
          a = function() {};
        }

        var b = a.React.Platform.OS;
      }
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/React\.Platform\.OS/, '"ios"'),
      {
        inlinePlatform: 'true',
        platform: 'ios',
      },
    );
  });

  it('replaces require("React").Platform.OS in the code', () => {
    const code = `
      function a() {
        var a = require('React').Platform.OS;
        var b = a.require('React').Platform.OS;
      }
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/require\('React'\)\.Platform\.OS/, '"android"'),
      {inlinePlatform: true, platform: 'android'},
    );
  });

  it('replaces ReactNative.Platform.OS in the code if ReactNative is a top level import', () => {
    const code = `
      var ReactNative = require('react-native');

      function a() {
        if (ReactNative.Platform.OS === 'android') {
          a = function() {};
        }

        var b = a.ReactNative.Platform.OS;
      }
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/ReactNative\.Platform\.OS/, '"android"'),
      {inlinePlatform: true, platform: 'android'},
    );
  });

  it('replaces require("react-native").Platform.OS in the code', () => {
    const code = `
      function a() {
        var a = require('react-native').Platform.OS;
        var b = a.require('react-native').Platform.OS;
      }
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/require\('react-native'\)\.Platform\.OS/, '"android"'),
      {inlinePlatform: true, platform: 'android'},
    );
  });

  it('inlines Platform.select in the code if Platform is a global and the argument is an object literal', () => {
    const code = `
      function a() {
        var a = Platform.select({ios: 1, android: 2});
        var b = a.Platform.select({ios: 1, android: 2});
      }
    `;

    compare([inlinePlugin], code, code.replace(/Platform\.select[^;]+/, '1'), {
      inlinePlatform: 'true',
      platform: 'ios',
    });
  });

  it("inlines Platform.select in the code if Platform is a global and the argument doesn't have a target platform in its keys", () => {
    const code = `
      function a() {
        var a = Platform.select({ios: 1, default: 2});
        var b = a.Platform.select({ios: 1, default: 2});
      }
    `;

    compare([inlinePlugin], code, code.replace(/Platform\.select[^;]+/, '2'), {
      inlinePlatform: 'true',
      platform: 'android',
    });
  });

  it("inlines Platform.select in the code if Platform is a global and the argument doesn't have a target platform in its keys but has native", () => {
    const code = `
      function a() {
        var a = Platform.select({ios: 1, native: 2});
        var b = a.Platform.select({ios: 1, native: 2});
      }
    `;

    compare([inlinePlugin], code, code.replace(/Platform\.select[^;]+/, '2'), {
      inlinePlatform: 'true',
      platform: 'android',
    });
  });

  it("doesn't inline Platform.select in the code if Platform is a global and the argument only has an unknown platform in its keys", () => {
    const code = `
      function a() {
        var a = Platform.select({web: 2});
        var b = a.Platform.select({native: 2});
      }
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/Platform\.select[^;]+/, 'undefined'),
      {
        inlinePlatform: 'true',
        platform: 'android',
      },
    );
  });

  it('inlines Platform.select in the code when using string keys', () => {
    const code = `
      function a() {
        var a = Platform.select({'ios': 1, 'android': 2});
      }
    `;

    compare([inlinePlugin], code, code.replace(/Platform\.select[^;]+/, '2'), {
      inlinePlatform: 'true',
      platform: 'android',
    });
  });

  it('does not inline Platform.select in the code when some of the properties are dynamic', () => {
    const code = `
      function a() {
        const COMPUTED_IOS = 'ios';
        const COMPUTED_ANDROID = 'android';
        var a = Platform.select({[COMPUTED_ANDROID]: 1, [COMPUTED_IOS]: 2, default: 3});
      }
    `;

    compare([inlinePlugin], code, code, {
      inlinePlatform: true,
      platform: 'android',
    });
  });

  it('does not inline Platform.select when all properties are dynamic', () => {
    const code = `
      function a() {
        var a = Platform.select({[COMPUTED_ANDROID]: 1, [COMPUTED_IOS]: 2});
      }
    `;

    compare([inlinePlugin], code, code, {
      inlinePlatform: true,
      platform: 'android',
    });
  });

  it('does not inline Platform.select if it receives a non-object', () => {
    const code = `
      function a() {
        var a = Platform.select(foo);
      }
    `;

    compare([inlinePlugin], code, code, {
      inlinePlatform: true,
      platform: 'android',
    });
  });

  it('replaces Platform.select in the code if Platform is a top level import', () => {
    const code = `
      var Platform = require('Platform');

      function a() {
        Platform.select({ios: 1, android: 2});
        var b = a.Platform.select({});
      }
    `;

    compare([inlinePlugin], code, code.replace(/Platform\.select[^;]+/, '2'), {
      inlinePlatform: 'true',
      platform: 'android',
    });
  });

  it('replaces Platform.select in the code if Platform is a top level import from react-native', () => {
    const code = `
      var Platform = require('react-native').Platform;
      function a() {
        Platform.select({ios: 1, android: 2});
        var b = a.Platform.select({});
      }
    `;

    compare([inlinePlugin], code, code.replace(/Platform\.select[^;]+/, '1'), {
      inlinePlatform: 'true',
      platform: 'ios',
    });
  });

  it('replaces require("Platform").select in the code', () => {
    const code = `
      function a() {
        var a = require('Platform').select({ios: 1, android: 2});
        var b = a.require('Platform').select({});
      }
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/require\('Platform'\)\.select[^;]+/, '2'),
      {
        inlinePlatform: 'true',
        platform: 'android',
      },
    );
  });

  it('replaces React.Platform.select in the code if React is a global', () => {
    const code = `
      function a() {
        var a = React.Platform.select({ios: 1, android: 2});
        var b = a.React.Platform.select({});
      }
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/React\.Platform\.select[^;]+/, '1'),
      {inlinePlatform: true, platform: 'ios'},
    );
  });

  it('replaces ReactNative.Platform.select in the code if ReactNative is a global', () => {
    const code = `
      function a() {
        var a = ReactNative.Platform.select({ios: 1, android: 2});
        var b = a.ReactNative.Platform.select({});
      }
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/ReactNative\.Platform\.select[^;]+/, '1'),
      {inlinePlatform: true, platform: 'ios'},
    );
  });

  it('replaces React.Platform.select in the code if React is a top level import', () => {
    const code = `
      var React = require('React');

      function a() {
        var a = React.Platform.select({ios: 1, android: 2});
        var b = a.React.Platform.select({});
      }
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/React\.Platform\.select[^;]+/, '1'),
      {inlinePlatform: true, platform: 'ios'},
    );
  });

  it('replaces require("React").Platform.select in the code', () => {
    const code = `
      function a() {
        var a = require('React').Platform.select({ios: 1, android: 2});
        var b = a.require('React').Platform.select({});
      }
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/require\('React'\)\.Platform\.select[^;]+/, '2'),
      {inlinePlatform: true, platform: 'android'},
    );
  });

  it('replaces ReactNative.Platform.select in the code if ReactNative is a top level import', () => {
    const code = `
      var ReactNative = require('react-native');

      function a() {
        var a = ReactNative.Plaftform.select({ios: 1, android: 2});
        var b = a.ReactNative.Platform.select;
      }
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/ReactNative\.Platform\.select[^;]+/, '2'),
      {inlinePlatform: true, platform: 'android'},
    );
  });

  it('replaces require("react-native").Platform.select in the code', () => {
    const code = `
      var a = require('react-native').Platform.select({ios: 1, android: 2});
      var b = a.require('react-native').Platform.select({});
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/require\('react-native'\)\.Platform\.select[^;]+/, '2'),

      {inlinePlatform: true, platform: 'android'},
    );
  });

  it("doesn't replace Platform.OS in the code if Platform is the left hand side of an assignment expression", () => {
    const code = `
      function a() {
        Platform.OS = "test"
      }
    `;

    compare([inlinePlugin], code, code, {
      inlinePlatform: true,
      platform: 'ios',
    });
  });

  it('replaces Platform.OS in the code if Platform is the right hand side of an assignment expression', () => {
    const code = `
      function a() {
        var a;
        a = Platform.OS;
      }
    `;

    compare([inlinePlugin], code, code.replace(/Platform\.OS/, '"ios"'), {
      inlinePlatform: 'true',
      platform: 'ios',
    });
  });

  it("doesn't replace React.Platform.OS in the code if Platform is the left hand side of an assignment expression", () => {
    const code = `
      function a() {
        React.Platform.OS = "test"
      }
    `;

    compare([inlinePlugin], code, code, {
      inlinePlatform: true,
      platform: 'ios',
    });
  });

  it('replaces React.Platform.OS in the code if Platform is the right hand side of an assignment expression', () => {
    const code = `
      function a() {
        var a;
        a = React.Platform.OS;
      }
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/React\.Platform\.OS/, '"ios"'),
      {
        inlinePlatform: 'true',
        platform: 'ios',
      },
    );
  });

  it("doesn't replace ReactNative.Platform.OS in the code if Platform is the left hand side of an assignment expression", () => {
    const code = `
      function a() {
        ReactNative.Platform.OS = "test"
      }
    `;

    compare([inlinePlugin], code, code, {
      inlinePlatform: true,
      platform: 'ios',
    });
  });

  it('replaces ReactNative.Platform.OS in the code if Platform is the right hand side of an assignment expression', () => {
    const code = `
      function a() {
        var a;
        a = ReactNative.Platform.OS;
      }
    `;
    compare(
      [inlinePlugin],
      code,
      code.replace(/ReactNative\.Platform\.OS/, '"ios"'),
      {inlinePlatform: true, platform: 'ios'},
    );
  });

  it('doesn\'t replace require("React").Platform.OS in the code if Platform is the left hand side of an assignment expression', () => {
    const code = `
      function a() {
        require("React").Platform.OS = "test"
      }
    `;

    compare([inlinePlugin], code, code, {
      inlinePlatform: true,
      platform: 'ios',
    });
  });

  it('replaces require("React").Platform.OS in the code if Platform is the right hand side of an assignment expression', () => {
    const code = `
      function a() {
        var a;
        a = require("React").Platform.OS;
      }
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/require\("React"\)\.Platform\.OS/, '"ios"'),
      {inlinePlatform: true, platform: 'ios'},
    );
  });

  it('replaces non-existing properties with `undefined`', () => {
    const code = `
      var a = Platform.select({ios: 1, android: 2});
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/Platform\.select[^;]+/, 'undefined'),
      {inlinePlatform: 'true', platform: 'does-not-exist'},
    );
  });

  it('replaces process.env.NODE_ENV in the code', () => {
    const code = `
      function a() {
        if (process.env.NODE_ENV === 'production') {
          return require('Prod');
        }

        return require('Dev');
      }
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/process\.env\.NODE_ENV/, '"production"'),
      {dev: false},
    );
  });

  it("doesn't replace process.env.NODE_ENV in the code if NODE_ENV is the right hand side of an assignment expression", () => {
    const code = `
      function a() {
        process.env.NODE_ENV = 'production';
      }
    `;

    compare([inlinePlugin], code, code, {dev: false});
  });

  it('replaces process.env.NODE_ENV in the code if NODE_ENV is the right hand side of an assignment expression', () => {
    const code = `
      function a() {
        var env;
        env = process.env.NODE_ENV;
      }
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/process\.env\.NODE_ENV/, '"production"'),
      {dev: false},
    );
  });

  it('can work with wrapped modules', () => {
    const code = `
      __arbitrary(function() {
        var Platform = require('react-native').Platform;
        var a = Platform.OS, b = Platform.select({android: 1, ios: 2});
      });
    `;

    compare(
      [inlinePlugin],
      code,
      code
        .replace(/Platform\.OS/, '"android"')
        .replace(/Platform\.select[^)]+\)/, '1'),
      {inlinePlatform: true, platform: 'android', isWrapped: true},
    );
  });

  it('can work with transformed require calls', () => {
    const code = `
      __arbitrary(require, function(arbitraryMapName) {
        var a = require(arbitraryMapName[123], 'react-native').Platform.OS;
      });
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/require\([^)]+\)\.Platform\.OS/, '"android"'),
      {inlinePlatform: true, platform: 'android', isWrapped: true},
    );
  });

  it('works with flow-declared variables', () => {
    const code = `
      declare var __DEV__;

      const a: boolean = __DEV__;
    `;

    const expected = `
      const a = false;
    `;

    compare([stripFlow, inlinePlugin], code, expected, {dev: false});
  });

  it('works with flow-declared variables in wrapped modules', () => {
    const code = `
      __d(() => {
        declare var __DEV__;

        const a: boolean = __DEV__;
      });
    `;

    const expected = `
      __d(() => {
        const a = false;
      });
    `;

    compare([stripFlow, inlinePlugin], code, expected, {dev: false});
  });
});
