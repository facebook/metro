/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 */

'use strict';

export type Node = {
  data: NodeData,
  position?: {
    x: number,
    y: number,
  },
  classes?: string,
};

export type NodeData = {
  id: string,
  label: string,
  deps: Array<string>,
  inverseDeps: Array<string>,
  type: string,
  size?: ?number,
  source: string,
  output: string,
};

export type Edge = {
  data: {
    id: string,
    source: string,
    target: string,
  },
  classes?: string,
};

export type CyGraph = {
  nodes: Array<Node>,
  edges: Array<Edge>,
};

export type CyGraphOptions = {
  layoutName: 'dagre' | 'euler' | 'klay' | 'spread',
};

export type CyGraphFilters = {
  incomingEdgesRange?: [number, number],
  outgoingEdgesRange?: [number, number],
  dependencyTypes?: Array<string>,
};

export type GraphInfo = {|
  maxIncomingEdges: number,
  maxOutgoingEdges: number,
  dependencyTypes: Array<string>,
|};

export type ModuleList = Array<{name: string, filePath: string}>;
