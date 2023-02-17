/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import type {Dependency} from '../../../types.flow';

import CountingSet from '../../../../lib/CountingSet';

import {wrap as raw} from 'jest-snapshot-serializer-raw';
import createModuleIdFactory from '../../../../lib/createModuleIdFactory';
import {wrapModule} from '../js';
import nullthrows from 'nullthrows';

let myModule;

expect.addSnapshotSerializer(require('jest-snapshot-serializer-raw'));

beforeEach(() => {
  myModule = {
    path: '/root/foo.js',
    dependencies: new Map<string, Dependency>([
      [
        'bar',
        {
          absolutePath: '/bar.js',
          // $FlowFixMe[missing-empty-array-annot]
          data: {data: {asyncType: null, locs: [], key: 'bar'}, name: 'bar'},
        },
      ],
      [
        'baz',
        {
          absolutePath: '/baz.js',
          // $FlowFixMe[missing-empty-array-annot]
          data: {data: {asyncType: null, locs: [], key: 'baz'}, name: 'baz'},
        },
      ],
    ]),
    getSource: () => Buffer.from(''),
    // $FlowFixMe[underconstrained-implicit-instantiation]
    inverseDependencies: new CountingSet(),
    output: [
      {
        data: {
          code: '__d(function() { console.log("foo") });',
          lineCount: 1,
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
      raw(
        wrapModule(myModule, {
          createModuleId: createModuleIdFactory(),
          dev: false,
          includeAsyncPaths: false,
          projectRoot: '/root',
          serverRoot: '/root',
        }),
      ),
    ).toMatchInlineSnapshot(`__d(function() { console.log("foo") },0,[1,2]);`);
  });

  it('Should wrap a module in dev mode', () => {
    expect(
      raw(
        wrapModule(myModule, {
          createModuleId: createModuleIdFactory(),
          dev: true,
          includeAsyncPaths: false,
          projectRoot: '/root',
          serverRoot: '/root',
        }),
      ),
    ).toMatchInlineSnapshot(
      `__d(function() { console.log("foo") },0,[1,2],"foo.js");`,
    );
  });

  it('should not wrap a script', () => {
    myModule.output[0].type = 'js/script';

    expect(
      raw(
        wrapModule(myModule, {
          createModuleId: createModuleIdFactory(),
          dev: true,
          includeAsyncPaths: false,
          projectRoot: '/root',
          serverRoot: '/root',
        }),
      ),
    ).toMatchInlineSnapshot(`__d(function() { console.log("foo") });`);
  });

  it('should use custom createModuleId param', () => {
    // Just use a createModuleId that returns the same path.
    expect(
      raw(
        wrapModule(myModule, {
          createModuleId: (path: string) => path,
          dev: false,
          includeAsyncPaths: false,
          projectRoot: '/root',
          serverRoot: '/root',
        }),
      ),
    ).toMatchInlineSnapshot(
      `__d(function() { console.log("foo") },"/root/foo.js",["/bar.js","/baz.js"]);`,
    );
  });

  it('includes the paths of async dependencies when requested', () => {
    const dep = nullthrows(myModule.dependencies.get('bar'));
    myModule.dependencies.set('bar', {
      ...dep,
      data: {...dep.data, data: {...dep.data.data, asyncType: 'async'}},
    });
    expect(
      raw(
        wrapModule(myModule, {
          createModuleId: createModuleIdFactory(),
          dev: false,
          includeAsyncPaths: true,
          projectRoot: '/root',
          serverRoot: '/root',
        }),
      ),
    ).toMatchInlineSnapshot(
      `__d(function() { console.log("foo") },0,{"0":1,"1":2,"paths":{"1":"../bar"}});`,
    );
  });

  it('async dependency paths respect serverRoot', () => {
    const dep = nullthrows(myModule.dependencies.get('bar'));
    myModule.dependencies.set('bar', {
      ...dep,
      data: {...dep.data, data: {...dep.data.data, asyncType: 'async'}},
    });
    expect(
      raw(
        wrapModule(myModule, {
          createModuleId: createModuleIdFactory(),
          dev: false,
          includeAsyncPaths: true,
          projectRoot: '/root',
          serverRoot: '/',
        }),
      ),
    ).toMatchInlineSnapshot(
      `__d(function() { console.log("foo") },0,{"0":1,"1":2,"paths":{"1":"bar"}});`,
    );
  });
});
