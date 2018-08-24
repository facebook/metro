/**
 * Copyright (c) 2015-present, Facebook, Inc.
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
const React = require('react');

const graphStyles = require('../graphStyles');

const {
  addDependencyNodes,
  expandDependencyNode,
} = require('../../utils/dependencyNodes');
const {showTooltip, hideTooltip} = require('../../utils/nodeTooltips');

import type {CyGraph, CyGraphOptions, NodeData} from '../../types.flow';
opaque type CyEvent = Object;

Cytoscape.use(require('cytoscape-dagre'));
Cytoscape.use(require('cytoscape-euler'));
Cytoscape.use(require('cytoscape-klay'));
Cytoscape.use(require('cytoscape-spread'));
Cytoscape.use(require('cytoscape-popper'));

type Props = {
  graph: CyGraph,
  options: CyGraphOptions,
  handleSelectionChange: (?NodeData) => void,
  hash: string,
};

class DependencyGraph extends React.Component<Props> {
  cy: Cytoscape;
  layout = {
    name: 'dagre',
    animate: true,
    zoom: false,
    fit: false,
    nodeDimensionsIncludeLabels: true,
    nodeSep: 1,
  };

  componentDidMount() {
    this.layout.name = this.props.options.layoutName;
    this.initializeCytoscape(this.props.graph);

    this.cy.on('tap', 'node', this.handleNodeTap);
    this.cy.on('tapstart', 'node', this.handleNodeTapStart);
    this.cy.on('mouseover', 'node', this.handleNodeMouseOver);
    this.cy.on('mouseout', 'node', this.handleNodeMouseOut);
    this.cy.on('select', 'node', this.handleNodeSelect);
    this.cy.on('unselect', 'node', this.handleNodeDeselect);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.props.graph !== prevProps.graph) {
      this.cy.remove(this.cy.elements());
      this.cy.add(this.props.graph);
      addDependencyNodes(this.cy, this.cy.nodes().toArray(), this.props.hash);
      this.cy.layout({...this.layout, randomize: true}).run();
    }

    if (this.props.options.layoutName !== prevProps.options.layoutName) {
      this.layout.name = this.props.options.layoutName;
      this.cy.layout({...this.layout, randomize: true, fit: true}).run();
    }
  }

  initializeCytoscape(graph: CyGraph) {
    this.cy = new Cytoscape({
      container: document.getElementById('graph-container'),
      elements: graph,
      maxZoom: 3,
      style: graphStyles,
    });
    addDependencyNodes(this.cy, this.cy.nodes().toArray(), this.props.hash);
    this.cy.layout({...this.layout, randomize: true, fit: true}).run();
  }

  handleNodeTap = (evt: CyEvent) => {
    const node = evt.target;
    if (node.hasClass('dependencies')) {
      expandDependencyNode(this.cy, node, this.layout, this.props.hash);
    }
  };

  handleNodeMouseOver(evt: CyEvent) {
    const node = evt.target;
    node.addClass('mouseover');
    showTooltip(node);
  }

  handleNodeMouseOut(evt: CyEvent) {
    const node = evt.target;
    node.removeClass('mouseover');
    hideTooltip(node);
  }

  handleNodeTapStart(evt: CyEvent) {
    const node = evt.target;
    hideTooltip(node);
  }

  handleNodeSelect = (evt: CyEvent) => {
    this.props.handleSelectionChange(evt.target.data());
  };

  handleNodeDeselect = (evt: CyEvent) => {
    this.props.handleSelectionChange();
  };

  render() {
    return (
      <div
        id="graph-container"
        style={{
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          position: 'absolute',
        }}
      />
    );
  }
}
module.exports = DependencyGraph;
