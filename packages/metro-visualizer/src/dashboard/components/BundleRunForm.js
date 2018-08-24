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

const handleAPIError = require('../../utils/handleAPIError');

import {message, Input, Select, Form, Button} from 'antd';

type Props = {
  handleStartedBundling: () => void,
  handleFinishedBundling: () => void,
};

type State = {
  entryPath: string,
  options: Array<string>,
};

class BundleRunForm extends React.Component<Props, State> {
  state = {entryPath: '', options: []};

  default_options = {
    platform: 'ios',
    dev: false,
    minify: false,
    entryModuleOnly: false,
    excludeSource: false,
    inlineSourceMap: false,
    runModule: false,
  };

  handleOptionSelect = (val: string) => {
    this.setState({options: this.state.options.concat([val])});
  };

  handleOptionDeselect = (val: string) => {
    this.setState({options: this.state.options.filter(op => op !== val)});
  };

  handleSubmit = (e: SyntheticEvent<>) => {
    this.props.handleStartedBundling();
    e.preventDefault();

    var url = `${this.state.entryPath}?`;

    const params = {};

    for (const [option, value] of Object.entries(this.default_options)) {
      if (value != null) {
        params[option] = String(value);
      }
    }

    for (const option of this.state.options) {
      params[option] = 'true';
    }

    for (const key of Object.keys(params)) {
      url = url.concat(`${key}=${params[key]}&`);
    }

    fetch(url.slice(0, -1))
      .then(handleAPIError)
      .then(res => this.props.handleFinishedBundling())
      .catch(error => message.error(error.message));
  };

  render() {
    return (
      <Form onSubmit={this.handleSubmit} style={{display: 'flex'}}>
        <Form.Item style={{width: '90%'}}>
          <Input
            name="entry-file"
            onChange={e => this.setState({entryPath: e.target.value})}
            placeholder="Entry file..."
            value={this.state.entryPath}
            addonAfter={
              <Select
                onSelect={this.handleOptionSelect}
                onDeselect={this.handleOptionDeselect}
                style={{width: 300}}
                mode="multiple"
                placeholder="Options..."
                value={this.state.options}>
                {Object.entries(this.default_options).map(
                  ([option, value]) =>
                    typeof value === 'boolean' ? (
                      <Select.Option value={option} key={option}>
                        {option}
                      </Select.Option>
                    ) : null,
                )}
              </Select>
            }
          />
        </Form.Item>
        <Form.Item
          style={{width: '10%', display: 'flex', justifyContent: 'flex-end'}}>
          <Button
            type="default"
            htmlType="submit"
            className="login-form-button">
            Build
          </Button>
        </Form.Item>
      </Form>
    );
  }
}

module.exports = BundleRunForm;
