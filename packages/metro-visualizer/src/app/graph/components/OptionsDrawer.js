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

const {css} = require('emotion');

import {
  Drawer,
  Button,
  Radio,
  Slider,
  Divider,
  Icon,
  Form,
  Checkbox,
} from 'antd';
import type {
  CyGraphOptions,
  CyGraphFilters,
  GraphInfo,
} from 'metro-visualizer/src/types.flow';

type Props = {
  options: CyGraphOptions,
  onOptionChange: CyGraphOptions => void,
  onFilterChange: CyGraphFilters => void,
  info: GraphInfo,
};

type State = {
  visible: boolean,
};

class OptionsDrawer extends React.Component<Props, State> {
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
          className={optionsDrawerButton}
          type="default"
          size="large"
          onClick={this.showDrawer}
          icon="setting"
        />
        <Drawer
          title={<Icon type="setting" style={{fontSize: 20}} />}
          width={350}
          placement="right"
          mask={false}
          onClose={this.onClose}
          visible={this.state.visible}>
          <Divider>Options</Divider>
          <Form>
            <Form.Item label="Layout">
              <Radio.Group
                defaultValue={this.props.options.layoutName}
                onChange={evt =>
                  this.props.onOptionChange({layoutName: evt.target.value})
                }>
                {['dagre', 'euler', 'klay'].map(layout => (
                  <Radio.Button value={layout} key={layout}>
                    {layout}
                  </Radio.Button>
                ))}
              </Radio.Group>
            </Form.Item>
          </Form>

          <Divider>Filters</Divider>
          <Form>
            <Form.Item label="Incoming Edges">
              <Slider
                range
                max={this.props.info.maxIncomingEdges}
                defaultValue={[0, this.props.info.maxIncomingEdges]}
                onChange={incomingEdgesRange =>
                  this.props.onFilterChange({incomingEdgesRange})
                }
              />
            </Form.Item>
            <Form.Item label="Outgoing Edges">
              <Slider
                range
                max={this.props.info.maxOutgoingEdges}
                defaultValue={[0, this.props.info.maxOutgoingEdges]}
                onChange={outgoingEdgesRange =>
                  this.props.onFilterChange({outgoingEdgesRange})
                }
              />
            </Form.Item>
            <Form.Item label="Type">
              <Checkbox.Group
                options={this.props.info.dependencyTypes}
                defaultValue={this.props.info.dependencyTypes}
                onChange={dependencyTypes =>
                  this.props.onFilterChange({dependencyTypes})
                }
              />
            </Form.Item>
          </Form>
        </Drawer>
      </div>
    );
  }
}

const optionsDrawerButton = css`
  position: absolute;
  top: 20px;
  right: 20px;
  font-size: 1.5em;
`;

module.exports = OptionsDrawer;
