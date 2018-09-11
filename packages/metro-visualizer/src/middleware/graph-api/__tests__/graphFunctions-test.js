/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @emails  oncall+javascript_foundation
 */

'use strict';

const testGraph = require('../testGraph');

const {
  getGraphFromModule,
  getGraphToModule,
  getGraphInfo,
  getGraphFromModuleToModule,
  _addPathToGraph,
  _buildGraphFromModuleToModule,
} = require('../functions');

it('builds inverse graph from a certain module as root', () => {
  expect(getGraphToModule(testGraph, 'path/to/st-paul.js')).toMatchSnapshot();
});

it('builds graph from a certain module as root', () => {
  expect(
    getGraphFromModule(testGraph, 'path/to/liverpool-street.js'),
  ).toMatchSnapshot();
});

it('adds path to graph correctly', () => {
  const resultGraph = {nodes: new Map(), edges: []};
  _addPathToGraph(
    new Set([
      'path/to/liverpool-street.js',
      'path/to/st-paul.js',
      'path/to/tottenham-court-road.js',
    ]),
    resultGraph,
    testGraph,
    false,
  );
  expect(resultGraph).toMatchSnapshot();
});

it('gets graph from a module to another', () => {
  expect(
    getGraphFromModuleToModule(
      testGraph,
      'path/to/liverpool-street.js',
      'path/to/tottenham-court-road.js',
    ),
  ).toMatchSnapshot();
});

it('builds inverse graph from one module to another', () => {
  const resultGraph = {nodes: new Map(), edges: []};
  _buildGraphFromModuleToModule(
    testGraph,
    'path/to/liverpool-street.js',
    'path/to/tottenham-court-road.js',
    resultGraph,
    true,
  );
  expect(resultGraph).toMatchSnapshot();
});

it('gets module list correctly', () => {
  expect(getGraphInfo(testGraph)).toMatchSnapshot();
});
