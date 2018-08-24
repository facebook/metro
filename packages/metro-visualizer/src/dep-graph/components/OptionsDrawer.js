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

const React = require('react');

const {css} = require('emotion');

import type {CyGraphOptions} from '../../types.flow';
import {Drawer, Button, Select} from 'antd';

type Props = {
  options: CyGraphOptions,
  onOptionChange: CyGraphOptions => void,
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
          title={'Options and Filters'}
          placement="right"
          mask={false}
          onClose={this.onClose}
          visible={this.state.visible}>
          <Select
            size="large"
            defaultValue={this.props.options.layoutName}
            onChange={layoutName => this.props.onOptionChange({layoutName})}>
            {['euler', 'dagre', 'klay', 'spread'].map(layout => (
              <Select.Option value={layout} key={layout}>
                {layout}
              </Select.Option>
            ))}
          </Select>
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
