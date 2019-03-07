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

const PresetsSection = require('./PresetsSection');
const React = require('react');

const {css} = require('emotion');
const message = css`
  text-align: center;
  margin-top: 8px;
  margin-bottom: 16px;
`;

import {Row, Col} from 'antd';
import type {Presets, OnBuildPresetHandler} from './PresetsSection';

type Props = {|
  onReload: () => void,
  onBuildPreset: OnBuildPresetHandler,
  presets: ?Presets,
  platforms: $ReadOnlyArray<string>,
|};

class WelcomeMessage extends React.Component<Props> {
  _onReloadClick = e => {
    e.preventDefault();
    this.props.onReload();
  };

  render() {
    const {presets, platforms, onBuildPreset} = this.props;
    const havePresets = !!(presets && presets.length);
    return (
      <>
        {havePresets ? (
          <PresetsSection
            presets={presets}
            platforms={platforms}
            onBuildPreset={onBuildPreset}
          />
        ) : null}
        <Row type="flex" justify="center">
          <Col span={16} className={message}>
            {havePresets ? '' : "I don't see any bundles here. "}
            If you've started a build externally,{' '}
            <a href="#" onClick={this._onReloadClick}>
              reload this page
            </a>{' '}
            to see it.
          </Col>
        </Row>
      </>
    );
  }
}

module.exports = WelcomeMessage;
