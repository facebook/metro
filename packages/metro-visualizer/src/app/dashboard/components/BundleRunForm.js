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

const handleAPIError = require('../../utils/handleAPIError');

const {css, cx} = require('emotion');

import {message, Input, Select, Row, Col, Button} from 'antd';
import type {RequestOptions} from 'metro/src/shared/types.flow.js';

type Props = {
  handleStartedBundling: () => void,
  handleFinishedBundling: () => void,
  platforms: $ReadOnlyArray<string>,
};

type State = {
  entryPath: string,
  options: Array<string>,
  platform: string,
};

const fullSizeInput = css`
  display: block;
`;

const submitButton = css`
  width: 100%;
`;

const verticalMargin = css`
  margin: 4px 0;
`;

class BundleRunForm extends React.Component<Props, State> {
  state = {entryPath: '', options: [], platform: 'ios'};

  default_options = {
    dev: false,
    minify: false,
    excludeSource: false,
    inlineSourceMap: false,
    runModule: false,
  };

  componentDidMount() {
    this._ensurePlatformInList();
  }

  componentDidUpdate() {
    this._ensurePlatformInList();
  }

  /**
   * Make sure we select a platform that's a member of the platform list given
   * in props. This is needed when, for example, our default platform 'ios'
   * isn't actually enabled in the bundler.
   */
  _ensurePlatformInList() {
    if (!this.props.platforms.includes(this.state.platform)) {
      this.setState({platform: this.props.platforms[0]});
    }
  }

  handleOptionSelect = (val: string) => {
    this.setState({options: this.state.options.concat([val])});
  };

  handleOptionDeselect = (val: string) => {
    this.setState({options: this.state.options.filter(op => op !== val)});
  };

  handlePlatformSelect = (platform: string) => {
    this.setState({platform});
  };

  handleSubmit = (e: SyntheticEvent<>) => {
    e.preventDefault();

    this._build();
  };

  _build() {
    this.props.handleStartedBundling();

    var url = `${this.state.entryPath}?`;

    const params = {platform: this.state.platform};

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
  }

  build(entryPath: string, buildOptions: $Shape<RequestOptions>) {
    this.setState(
      state => {
        const {platform = state.platform, ...params} = buildOptions || {};
        return {
          entryPath,
          platform,
          options: Object.keys(params).filter(key => params[key]),
        };
      },
      () => {
        this._build();
      },
    );
  }

  render() {
    return (
      <form onSubmit={this.handleSubmit}>
        <Row type="flex" gutter={8} justify="center">
          <Col xs={16} sm={5} lg={6}>
            <Input
              className={cx(fullSizeInput, verticalMargin)}
              name="entry-file"
              onChange={e => this.setState({entryPath: e.target.value})}
              placeholder="Entry file..."
              value={this.state.entryPath}
            />
          </Col>
          <Col xs={16} sm={5} lg={6}>
            <Select
              className={cx(fullSizeInput, verticalMargin)}
              onSelect={this.handleOptionSelect}
              onDeselect={this.handleOptionDeselect}
              mode="multiple"
              placeholder="Options..."
              value={this.state.options}>
              {Object.entries(this.default_options).map(([option, value]) =>
                typeof value === 'boolean' ? (
                  <Select.Option value={option} key={option}>
                    {option}
                  </Select.Option>
                ) : null,
              )}
            </Select>
          </Col>
          <Col xs={10} sm={3} lg={2}>
            <Select
              className={cx(fullSizeInput, verticalMargin)}
              value={this.state.platform}
              onSelect={this.handlePlatformSelect}>
              {this.props.platforms.map(platform => (
                <Select.Option value={platform} key={platform}>
                  {platform}
                </Select.Option>
              ))}
            </Select>
          </Col>
          <Col xs={6} sm={3} lg={2}>
            <Button
              className={cx(submitButton, verticalMargin)}
              type="default"
              htmlType="submit"
              disabled={this.state.entryPath.trim() === ''}>
              Build
            </Button>
          </Col>
        </Row>
      </form>
    );
  }
}

module.exports = BundleRunForm;
