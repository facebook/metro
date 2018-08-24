/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @emails  oncall+javascript_foundation
 */

'use strict';

const dummyMetroGraph = require('../dummyMetroGraph');

const {
  getGraphFromModule,
  getGraphToModule,
  getAllModules,
  getGraphFromModuleToModule,
  _addPathToGraph,
  _buildGraphFromModuleToModule,
} = require('../graphFunctions');

it('builds inverse graph from a certain module as root', () => {
  expect(
    getGraphToModule(dummyMetroGraph, 'path/to/st-paul.js'),
  ).toMatchSnapshot();
});

it('builds graph from a certain module as root', () => {
  expect(
    getGraphFromModule(dummyMetroGraph, 'path/to/liverpool-street.js'),
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
    dummyMetroGraph,
    false,
  );
  expect(resultGraph).toMatchSnapshot();
});

it('gets graph from a module to another', () => {
  expect(
    getGraphFromModuleToModule(
      dummyMetroGraph,
      'path/to/liverpool-street.js',
      'path/to/tottenham-court-road.js',
    ),
  ).toMatchSnapshot();
});

it('builds inverse graph from one module to another', () => {
  const resultGraph = {nodes: new Map(), edges: []};
  _buildGraphFromModuleToModule(
    dummyMetroGraph,
    'path/to/liverpool-street.js',
    'path/to/tottenham-court-road.js',
    resultGraph,
    true,
  );
  expect(resultGraph).toMatchSnapshot();
});

it('gets module list correctly', () => {
  expect(getAllModules(dummyMetroGraph)).toMatchSnapshot();
});
