/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

const createModuleIdFactory = require('../../../lib/createModuleIdFactory');
const deltaJSBundle = require('../deltaJSBundle');

function createModule(name, dependencies, type = 'js/module') {
  return [
    `/root/${name}.js`,
    {
      path: `/root/${name}.js`,
      dependencies: new Map(
        dependencies.map(dep => [
          dep,
          {absolutePath: `/root/${dep}.js`, data: {isAsync: false, name: dep}},
        ]),
      ),
      output: [{type, data: {code: `__d(function() {${name}()});`}}],
    },
  ];
}

const prepend = [createModule('prep1', [])[1], createModule('prep2', [])[1]];

const graph = {
  dependencies: new Map([
    createModule('entrypoint', ['foo', 'bar']),
    createModule('foo', []),
    createModule('bar', []),
  ]),
  entryPoints: ['/root/entrypoint.js'],
};

const options = {
  processModuleFilter: module => true,
  createModuleId: createModuleIdFactory(),
  dev: true,
  getRunModuleStatement: moduleId => `__r(${JSON.stringify(moduleId)});`,
  projectRoot: '/root',
  runBeforeMainModule: [],
  runModule: true,
  sourceMapUrl: 'http://localhost/bundle.map',
};

it('returns a base bundle', () => {
  expect(
    deltaJSBundle(
      'foo',
      prepend,
      {
        modified: graph.dependencies,
        deleted: new Set(),
        reset: true,
      },
      'revisionId',
      graph,
      options,
    ),
  ).toEqual({
    base: true,
    revisionId: 'revisionId',
    pre: '__d(function() {prep1()});\n__d(function() {prep2()});',
    post: '//# sourceMappingURL=http://localhost/bundle.map',
    modules: [
      [0, '__d(function() {entrypoint()},0,[1,2],"entrypoint.js");'],
      [1, '__d(function() {foo()},1,[],"foo.js");'],
      [2, '__d(function() {bar()},2,[],"bar.js");'],
    ],
  });
});

it('returns an incremental delta with modified files', () => {
  expect(
    deltaJSBundle(
      'foo',
      prepend,
      {
        modified: new Map([createModule('bar', [])]),
        deleted: new Set(),
        reset: false,
      },
      'revisionId',
      graph,
      options,
    ),
  ).toEqual({
    base: false,
    revisionId: 'revisionId',
    modules: [[2, '__d(function() {bar()},2,[],"bar.js");']],
    deleted: [],
  });
});

it('returns an incremental delta with deleted files', () => {
  expect(
    deltaJSBundle(
      'foo',
      prepend,
      {
        modified: new Map([createModule('entrypoint', ['foo'])]),
        deleted: new Set(['/root/bar.js']),
        reset: false,
      },
      'revisionId',
      graph,
      options,
    ),
  ).toEqual({
    base: false,
    revisionId: 'revisionId',
    modules: [[0, '__d(function() {entrypoint()},0,[1],"entrypoint.js");']],
    deleted: [2],
  });
});
