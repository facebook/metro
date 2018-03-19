/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @flow
 * @format
 */

'use strict';

const createModuleIdFactory = require('../../../../lib/createModuleIdFactory');

const {wrapModule} = require('../js');

let myModule;

beforeEach(() => {
  myModule = {
    path: '/root/foo.js',
    dependencies: new Map([['bar', '/bar'], ['baz', '/baz']]),
    inverseDependencies: new Set(),
    output: {
      code: '__d(function() { console.log("foo") });',
      map: [],
      source: '',
      type: 'module',
    },
  };
});

describe('wrapModule()', () => {
  it('Should wrap a module in nondev mode', () => {
    expect(
      wrapModule(myModule, {
        createModuleIdFn: createModuleIdFactory(),
        dev: false,
      }),
    ).toEqual('__d(function() { console.log("foo") },0,[1,2]);');
  });

  it('Should wrap a module in dev mode', () => {
    expect(
      wrapModule(myModule, {
        createModuleIdFn: createModuleIdFactory(),
        dev: true,
      }),
    ).toEqual('__d(function() { console.log("foo") },0,[1,2],"foo.js");');
  });

  it('should not wrap a script', () => {
    myModule.output.type = 'script';

    expect(
      wrapModule(myModule, {
        createModuleIdFn: createModuleIdFactory(),
        dev: true,
      }),
    ).toEqual(myModule.output.code);
  });

  it('should use custom createModuleIdFn param', () => {
    // Just use a createModuleIdFn that returns the same path.
    expect(
      wrapModule(myModule, {
        createModuleIdFn: path => path,
        dev: false,
      }),
    ).toEqual(
      '__d(function() { console.log("foo") },"/root/foo.js",["/bar","/baz"]);',
    );
  });
});
