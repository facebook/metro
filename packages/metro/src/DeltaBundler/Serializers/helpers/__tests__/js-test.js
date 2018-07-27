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
    dependencies: new Map([
      ['bar', {absolutePath: '/bar', data: {isAsync: false, name: 'bar'}}],
      ['baz', {absolutePath: '/baz', data: {isAsync: false, name: 'baz'}}],
    ]),
    getSource: () => '',
    inverseDependencies: new Set(),
    output: [
      {
        data: {
          code: '__d(function() { console.log("foo") });',
          map: [],
        },

        type: 'js/module',
      },
    ],
  };
});

describe('wrapModule()', () => {
  it('Should wrap a module in nondev mode', () => {
    expect(
      wrapModule(myModule, {
        createModuleId: createModuleIdFactory(),
        dev: false,
        projectRoot: '/root',
      }),
    ).toEqual('__d(function() { console.log("foo") },0,[1,2]);');
  });

  it('Should wrap a module in dev mode', () => {
    expect(
      wrapModule(myModule, {
        createModuleId: createModuleIdFactory(),
        dev: true,
        projectRoot: '/root',
      }),
    ).toEqual('__d(function() { console.log("foo") },0,[1,2],"foo.js");');
  });

  it('should not wrap a script', () => {
    myModule.output[0].type = 'js/script';

    expect(
      wrapModule(myModule, {
        createModuleId: createModuleIdFactory(),
        dev: true,
        projectRoot: '/root',
      }),
    ).toEqual(myModule.output[0].data.code);
  });

  it('should use custom createModuleId param', () => {
    // Just use a createModuleId that returns the same path.
    expect(
      wrapModule(myModule, {
        createModuleId: path => path,
        dev: false,
        projectRoot: '/root',
      }),
    ).toEqual(
      '__d(function() { console.log("foo") },"/root/foo.js",["/bar","/baz"]);',
    );
  });
});
