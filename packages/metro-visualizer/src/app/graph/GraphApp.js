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
const DependencyGraph = require('./components/DependencyGraph');
const InfoDrawer = require('./components/InfoDrawer');
const OptionsDrawer = require('./components/OptionsDrawer');
const React = require('react');
const SearchBar = require('./components/SearchBar');

const handleAPIError = require('../utils/handleAPIError');

const {css} = require('emotion');

import {message, Row, Col, Button, Icon} from 'antd';
import type {
  CyGraphFilters,
  CyGraphOptions,
  CyGraph,
  ModuleList,
  NodeData,
  GraphInfo,
} from 'metro-visualizer/src/types.flow';

type Props = {
  match: {
    params: Array<string>,
    isExact: boolean,
    path: string,
    url: string,
  },
};

type State = {
  graph?: CyGraph,
  modules?: ModuleList,
  info?: GraphInfo,
  selectedNodeData?: ?NodeData,
  graphFilters: CyGraphFilters,
  graphOptions: CyGraphOptions,
  showPathSearch: boolean,
  showLoadingIndicator: boolean,
};

Cytoscape.use(require('cytoscape-euler'));

class GraphApp extends React.Component<Props, State> {
  state: State = {
    showLoadingIndicator: true,
    showPathSearch: false,
    graphOptions: {layoutName: 'dagre'},
    graphFilters: {},
  };
  firstModule: string;
  secondModule: string;

  componentDidMount() {
    fetch(`/visualizer/graph/info?hash=${this.props.match.params[0]}`)
      .then(res => {
        this.setState({showLoadingIndicator: false});
        return handleAPIError(res);
      })
      .then(response => response.json())
      .then(res => {
        this.setState(res);
      })
      .catch(error => message.error(error.message));
  }

  handleModuleSelection = (modulePath: string) => {
    this.firstModule = modulePath;
    if (!this.state.showPathSearch) {
      this.setState({showLoadingIndicator: true});
      fetch(
        `/visualizer/graph/modules/${modulePath}?hash=${
          this.props.match.params[0]
        }`,
      )
        .then(res => {
          this.setState({showLoadingIndicator: false});
          return handleAPIError(res);
        })
        .then(response => response.json())
        .then(graph => this.setState({graph}))
        .catch(error => message.error(error.message));
    }
  };

  handleSecondModuleSelection = (modulePath: string) => {
    this.setState({showLoadingIndicator: true});
    fetch(
      `/visualizer/graph/modules/${this.firstModule}?to=${modulePath}&hash=${
        this.props.match.params[0]
      }`,
    )
      .then(res => {
        this.setState({showLoadingIndicator: false});
        return handleAPIError(res);
      })
      .then(response => response.json())
      .then(graph => this.setState({graph}))
      .catch(error => message.error(error.message));
  };

  handleOptionChange = (options: CyGraphOptions) => {
    this.setState({graphOptions: options});
  };

  handleFilterChange = (filters: CyGraphFilters) => {
    this.setState({
      graphFilters: Object.assign({}, this.state.graphFilters, filters),
    });
  };

  togglePathSearch = () => {
    this.setState({showPathSearch: !this.state.showPathSearch});
  };

  render() {
    return (
      <div id="container">
        {this.state.graph && (
          <DependencyGraph
            hash={this.props.match.params[0]}
            graph={this.state.graph}
            options={this.state.graphOptions}
            filters={this.state.graphFilters}
            handleSelectionChange={selectedNodeData =>
              this.setState({selectedNodeData})
            }
          />
        )}
        {this.state.modules && this.state.info && (
          <div>
            <Row
              type="flex"
              justify="center"
              align="middle"
              className={searchRow}>
              <Col
                span={this.state.showPathSearch ? 14 : 12}
                className={searchCol}>
                <SearchBar
                  data={this.state.modules}
                  onSelection={this.handleModuleSelection}
                />
                {this.state.showPathSearch && (
                  <Icon
                    type="arrow-right"
                    style={{fontSize: 20, marginTop: 10}}
                  />
                )}
                {this.state.showPathSearch && (
                  <SearchBar
                    data={this.state.modules}
                    onSelection={this.handleSecondModuleSelection}
                  />
                )}
                <Button
                  className={headerButton}
                  type="default"
                  size="large"
                  onClick={this.togglePathSearch}
                  icon={this.state.showPathSearch ? 'close' : 'share-alt'}
                />
              </Col>
            </Row>
            <InfoDrawer data={this.state.selectedNodeData} />
            <OptionsDrawer
              options={this.state.graphOptions}
              onOptionChange={this.handleOptionChange}
              onFilterChange={this.handleFilterChange}
              info={this.state.info}
            />
          </div>
        )}

        {this.state.showLoadingIndicator && (
          <Icon type="loading" className={loadingIndicator} />
        )}
      </div>
    );
  }
}

const searchRow = css`
  margin-top: 20px;
`;

const loadingIndicator = css`
  font-size: 4em;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translateY(-50%) translateX(-50%);
`;

const headerButton = css`
  height: 40px;
  width: 40px;
`;

const searchCol = css`
  display: flex;
`;

module.exports = GraphApp;
