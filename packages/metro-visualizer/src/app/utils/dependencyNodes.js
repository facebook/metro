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

const Cytoscape = require('cytoscape');

const handleAPIError = require('./handleAPIError');

import {message} from 'antd';
opaque type CyNode = Object;

function addDependencyNodes(cy: Cytoscape, nodes: Array<CyNode>, hash: string) {
  for (const node of nodes) {
    const depsNotInGraph = [];
    for (const dep of node.data('deps')) {
      if (cy.getElementById(dep).length === 0) {
        depsNotInGraph.push(dep);
      }
    }
    if (depsNotInGraph.length > 0) {
      addDependencyNode(
        cy,
        node.data('id'),
        node.data('depsSize'),
        node.data('type'),
        depsNotInGraph,
        node.position(),
        hash,
        false,
      );
    }

    const inverseDepsNotInGraph = [];
    for (const invDep of node.data('inverseDeps')) {
      if (cy.getElementById(invDep).length === 0) {
        inverseDepsNotInGraph.push(invDep);
      }
    }
    if (inverseDepsNotInGraph.length > 0) {
      addDependencyNode(
        cy,
        node.data('id'),
        node.data('invDepsSize'),
        node.data('type'),
        inverseDepsNotInGraph,
        node.position(),
        hash,
        true,
      );
    }
  }
}

function addDependencyNode(
  cy: Cytoscape,
  parentNodeId: string,
  size: number,
  type: string,
  bundledDeps: Array<string>,
  position: {x: number, y: number},
  hash: string,
  inverse?: boolean,
) {
  const id = `${parentNodeId}${inverse ? '-inv' : ''}-dependencies`;
  cy.add({
    group: 'nodes',
    classes: 'dependencies',
    data: {
      id,
      bundledDeps,
      parentNodeId,
      inverse,
      size,
      type,
      label: `${bundledDeps.length}`,
      deps: [],
      inverseDeps: [],
    },
    position: Object.assign({}, position),
  });

  cy.add({
    group: 'edges',
    data: {
      id: `${id}-edge`,
      source: inverse ? id : parentNodeId,
      target: inverse ? parentNodeId : id,
    },
    classes: 'dependencies',
  });
}

function expandDependencyNode(
  cy: Cytoscape,
  node: CyNode,
  layout: {name: string},
  hash: string,
) {
  const query = node.data('inverse') ? '&inverse=true' : '';
  fetch(
    `/visualizer/graph/modules/${node.data(
      'parentNodeId',
    )}?hash=${hash}${query}`,
  )
    .then(handleAPIError)
    .then(response => response.json())
    .then(graph => {
      graph.nodes.forEach(
        n => (n.position = {x: node.position().x, y: node.position().y}),
      );

      cy.remove(node);
      const eles = cy.add(graph);
      addDependencyNodes(cy, eles.nodes().toArray(), hash);
      cy.layout(layout).run();
    })
    .catch(error => message.error(error.message));
}

module.exports = {addDependencyNodes, expandDependencyNode};
