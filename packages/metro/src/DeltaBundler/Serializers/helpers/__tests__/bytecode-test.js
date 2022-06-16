/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @flow strict-local
 * @format
 */

'use strict';

import CountingSet from '../../../../lib/CountingSet';

const createModuleIdFactory = require('../../../../lib/createModuleIdFactory');
const {wrapModule} = require('../bytecode');
const {compile, validateBytecodeModule} = require('metro-hermes-compiler');

let myModule, bytecode;

beforeEach(() => {
  const code = '__d(function() { console.log("foo") });';
  ({bytecode} = compile(
    '__d(function() { console.log("foo") },$$_METRO_DEFINE_GLOBAL[0],$$_METRO_DEFINE_GLOBAL[1]);',
    {sourceURL: 'test.js'},
  ));

  myModule = {
    path: '/root/foo.js',
    dependencies: new Map([
      [
        'bar',
        {
          absolutePath: '/bar',
          data: {data: {asyncType: null, locs: []}, name: 'bar'},
        },
      ],
      [
        'baz',
        {
          absolutePath: '/baz',
          data: {data: {asyncType: null, locs: []}, name: 'baz'},
        },
      ],
    ]),
    getSource: () => Buffer.from(''),
    inverseDependencies: new CountingSet(),
    output: [
      {
        data: {
          code,
          lineCount: 1,
          map: [],
        },
        type: 'js/module',
      },
      {
        data: {
          bytecode,
        },
        type: 'bytecode/module',
      },
    ],
  };
});

it('produces a bytecode header buffer for each module', () => {
  const buffers = wrapModule(myModule, {
    createModuleId: createModuleIdFactory(),
    dev: true,
    projectRoot: '/root',
  });
  expect(buffers.length).toBe(2);
  expect(() => validateBytecodeModule(buffers[0], 0)).not.toThrow();
  expect(buffers[1]).toBe(bytecode);
});

it('does not produce a bytecode header buffer for a script', () => {
  // $FlowFixMe[cannot-write]
  myModule.output[1].type = 'bytecode/script';

  const buffers = wrapModule(myModule, {
    createModuleId: createModuleIdFactory(),
    dev: true,
    projectRoot: '/root',
  });
  expect(buffers.length).toBe(1);
  expect(buffers[0]).toBe(bytecode);
});
