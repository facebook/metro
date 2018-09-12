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
const React = require('react');

const graphStyles = require('../graphStyles');

const {
  addDependencyNodes,
  expandDependencyNode,
} = require('../../utils/dependencyNodes');
const {showTooltip, hideTooltip} = require('../../utils/nodeTooltips');

import type {
  CyGraph,
  CyGraphOptions,
  CyGraphFilters,
  NodeData,
} from 'metro-visualizer/src/types.flow';
opaque type CyEvent = Object;

Cytoscape.use(require('cytoscape-dagre'));
Cytoscape.use(require('cytoscape-euler'));
Cytoscape.use(require('cytoscape-klay'));
Cytoscape.use(require('cytoscape-spread'));
Cytoscape.use(require('cytoscape-popper'));

type Props = {
  graph: CyGraph,
  options: CyGraphOptions,
  filters: ?CyGraphFilters,
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

    this.handleOptionChange(prevProps.options, this.props.options);
    if (this.props.filters != null) {
      this.handleFilterChange(prevProps.filters, this.props.filters);
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

  handleOptionChange(prevOptions: CyGraphOptions, options: CyGraphOptions) {
    if (options.layoutName !== prevOptions.layoutName) {
      this.layout.name = options.layoutName;
      this.cy.layout({...this.layout, randomize: true, fit: true}).run();
    }
  }

  handleFilterChange(prevFilters: ?CyGraphFilters, filters: CyGraphFilters) {
    if (JSON.stringify(prevFilters) !== JSON.stringify(filters)) {
      this.cy
        .style()
        .selector('node')
        .style({
          display: node => {
            const depType = node.data('type');

            let incomingEdges;
            let outgoingEdges;
            if (node.hasClass('dependencies')) {
              const parent = this.cy.nodes().$id(node.data('parentNodeId'));
              incomingEdges = parent.data('inverseDeps').length;
              outgoingEdges = parent.data('deps').length;
            } else {
              incomingEdges = node.data('inverseDeps').length;
              outgoingEdges = node.data('deps').length;
            }

            if (
              filters.incomingEdgesRange != null &&
              (incomingEdges < filters.incomingEdgesRange[0] ||
                incomingEdges > filters.incomingEdgesRange[1])
            ) {
              return 'none';
            }

            if (
              filters.outgoingEdgesRange != null &&
              (outgoingEdges < filters.outgoingEdgesRange[0] ||
                outgoingEdges > filters.outgoingEdgesRange[1])
            ) {
              return 'none';
            }

            if (
              filters.dependencyTypes != null &&
              !filters.dependencyTypes.includes(depType)
            ) {
              return 'none';
            }

            return 'element';
          },
        })
        .update();

      this.cy.layout(this.layout).run();
    }
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
    const node = evt.target;
    // Dependency nodes do not map to actual modules; they cannot be selected.
    if (!node.hasClass('dependencies')) {
      this.props.handleSelectionChange(evt.target.data());
    }
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
