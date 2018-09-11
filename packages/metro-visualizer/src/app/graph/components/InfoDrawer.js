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

const React = require('react');

const filesize = require('filesize');

const {css} = require('emotion');

import {Drawer, Button, List} from 'antd';
import type {NodeData} from 'metro-visualizer/src/types.flow';

type Props = {
  data?: ?NodeData,
};

type State = {
  visible: boolean,
};

class InfoDrawer extends React.Component<Props, State> {
  state = {visible: false};

  showDrawer = () => {
    this.setState({
      visible: true,
    });
  };

  onClose = () => {
    this.setState({
      visible: false,
    });
  };

  render() {
    return (
      <div>
        <Button
          className={infoDrawerButton}
          type="default"
          size="large"
          onClick={this.showDrawer}
          icon="info"
        />
        <Drawer
          title={this.props.data ? this.props.data.label : 'Module Info'}
          placement="left"
          mask={false}
          onClose={this.onClose}
          visible={this.state.visible}>
          {this.props.data ? (
            <NodeDataView data={this.props.data} />
          ) : (
            'Select a node to display information about it...'
          )}
        </Drawer>
      </div>
    );
  }
}

const NodeDataView = (props: {data: NodeData}) => (
  <List itemLayout="vertical">
    <List.Item>
      <List.Item.Meta title="Path" />
      <div className={pathWrapper}>{props.data.id}</div>
    </List.Item>
    <List.Item>
      <List.Item.Meta title="Dependencies" />
      <DepList deps={props.data.deps} />
    </List.Item>
    <List.Item>
      <List.Item.Meta title="Inverse Dependencies" />
      <DepList deps={props.data.inverseDeps} />
    </List.Item>
    {props.data.size != null && (
      <List.Item>
        <List.Item.Meta title="Size" />
        {filesize(props.data.size)}
      </List.Item>
    )}
  </List>
);

const DepList = (props: {deps: Array<string>}) => (
  <List itemLayout="vertical" className={depList}>
    {props.deps.map(dep => (
      <List.Item key={dep}>
        <p className={depTitle}>{dep.substring(dep.lastIndexOf('/') + 1)}</p>
        <div className={pathWrapper}>{dep}</div>
      </List.Item>
    ))}
  </List>
);

const infoDrawerButton = css`
  position: absolute;
  top: 20px;
  left: 20px;
  font-size: 1.5em;
`;

const depList = css`
  max-height: 300px;
  overflow: auto;
  margin-left: 10px;
`;

const depTitle = css`
  font-weight: bold;
`;

const pathWrapper = css`
  height: 3em;
  margin-bottom: -3em;
  overflow-y: hidden;
  overflow-x: auto;
  white-space: nowrap;
`;

module.exports = InfoDrawer;
