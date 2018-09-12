/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

/* eslint-env browser */

'use strict';

const {scaleLinear} = require('d3-scale');

opaque type CyElement = Object;

function bytesToNodeSize(filesize: number): number {
  return scaleLinear()
    .domain([50, 15000])
    .range([8, 25])(Math.min(filesize, 15000));
}

module.exports = [
  {
    selector: 'node',
    style: {
      'background-color': '#ddd',
      'text-outline-color': '#ddd',
      'text-outline-width': 1,
      'text-valign': 'center',
      'font-size': '6pt',
      'text-wrap': 'wrap',
      width: (node: CyElement) => bytesToNodeSize(node.data('size')),
      height: (node: CyElement) => bytesToNodeSize(node.data('size')),
      label: 'data(label)',
      'font-family': 'Menlo, Monaco',
    },
  },
  {
    selector: 'node.mouseover',
    style: {
      'text-outline-color': '#ccc',
      'text-outline-width': 2,
      'font-size': '9pt',
      'z-compound-depth': 'top',
    },
  },
  {
    selector: 'node.dependencies',
    style: {
      width: 15,
      height: 15,
      'border-width': '0px',
      'background-opacity': 0,
      'text-valign': 'center',
      'text-wrap': 'none',
      color: (node: CyElement) =>
        scaleLinear()
          .domain([50, 100000])
          .range(['green', 'red'])(node.data('size')),
      opacity: 0.7,
    },
  },
  {
    selector: 'edge',
    style: {
      width: 1,
      'curve-style': 'bezier',
      'line-color': (edge: CyElement) =>
        edge.data('isAsync') ? '#bbf' : '#ddd',
      'target-arrow-color': (edge: CyElement) =>
        edge.data('isAsync') ? '#bbf' : '#ddd',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.7,
      'line-style': (edge: CyElement) =>
        edge.data('isAsync') ? 'dotted' : 'solid',
    },
  },
  {
    selector: 'edge.dependencies',
    style: {
      'line-color': '#ddd',
      'line-style': 'dashed',
      'arrow-scale': 0.5,
      opacity: 0.7,
    },
  },
  {
    selector: 'node:selected',
    style: {
      'background-color': '#999',
      'text-outline-color': '#999',
    },
  },
];
