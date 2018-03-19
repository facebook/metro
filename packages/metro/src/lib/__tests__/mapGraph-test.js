/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

const mapGraph = require('../mapGraph');

let graph;

beforeEach(() => {
  graph = {
    dependencies: new Map([
      ['/entryPoint', {name: 'entryPoint', id: '1'}],
      ['/foo', {name: 'foo', id: '2'}],
      ['/baz', {name: 'baz', id: '3'}],
    ]),
    entryPoints: ['/entryPoint'],
  };
});

it('should map the passed graph when a sync function is passed', async () => {
  const mapped = await mapGraph(graph, element => ({
    name: '-' + element.name + '-',
    id: parseInt(element.id, 10),
  }));

  expect(mapped.dependencies).toEqual(
    new Map([
      ['/entryPoint', {name: '-entryPoint-', id: 1}],
      ['/foo', {name: '-foo-', id: 2}],
      ['/baz', {name: '-baz-', id: 3}],
    ]),
  );
  expect(mapped.entryPoints).toEqual(['/entryPoint']);
});

it('should map the passed graph when an async function is passed', async () => {
  const mapped = await mapGraph(graph, async element => ({
    name: '-' + element.name + '-',
    id: parseInt(element.id, 10),
  }));

  expect(mapped.dependencies).toEqual(
    new Map([
      ['/entryPoint', {name: '-entryPoint-', id: 1}],
      ['/foo', {name: '-foo-', id: 2}],
      ['/baz', {name: '-baz-', id: 3}],
    ]),
  );
  expect(mapped.entryPoints).toEqual(['/entryPoint']);
});
