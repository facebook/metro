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

const BundlePlots = require('./components/BundlePlots');
const BundleRunForm = require('./components/BundleRunForm');
const React = require('react');
const WelcomeMessage = require('./components/WelcomeMessage');

const handleAPIError = require('../utils/handleAPIError');

const {injectGlobal, css} = require('emotion');
const {Link} = require('react-router-dom');

import type {
  MetroHistory,
  BuildDetails,
} from '../../middleware/metroHistory.js';
import {message, Row, Col, Card, Tag, Icon} from 'antd';
import type {BundleOptions} from 'metro/src/shared/types.flow.js';

type State = {
  metroHistory: ?MetroHistory,
  selectedBundleHash: ?string,
  isLoadingData: boolean,
  isBundling: boolean,
};

class DashboardApp extends React.Component<mixed, State> {
  state = {
    metroHistory: undefined,
    selectedBundleHash: undefined,
    isLoadingData: false,
    isBundling: false,
  };

  componentDidMount() {
    this.fetchBundles();
  }

  fetchBundles() {
    this.setState({isLoadingData: true});
    fetch('/visualizer/bundles')
      .then(res => {
        this.setState({isLoadingData: false});
        return handleAPIError(res);
      })
      .then(response => response.json())
      .then(metroHistory => {
        this.setState({metroHistory});
      })
      .catch(error => message.error(error.message));
  }

  _handleReload = () => {
    this.fetchBundles();
  };

  render() {
    const {metroHistory, isLoadingData, isBundling} = this.state;
    const loadedEmptyHistory =
      !isLoadingData && metroHistory && Object.keys(metroHistory).length === 0;
    return (
      <div>
        <Row type="flex" justify="center">
          <img
            src={'https://facebook.github.io/metro/img/metro.svg'}
            className={logo}
            alt="logo"
          />
        </Row>

        <Row type="flex" justify="center">
          <Col span={16}>
            <BundleRunForm
              handleStartedBundling={() => this.setState({isBundling: true})}
              handleFinishedBundling={() => {
                this.fetchBundles();
                this.setState({isBundling: false});
              }}
            />
          </Col>
        </Row>

        {loadedEmptyHistory && !isBundling ? (
          <WelcomeMessage onReload={this._handleReload} />
        ) : null}

        <Row type="flex" justify="center">
          <Col span={16}>
            {metroHistory &&
              Object.keys(metroHistory).map(bundleHash => (
                <Link to={`/graph/${bundleHash}`} key={bundleHash}>
                  <BundleCard
                    onClick={() =>
                      this.setState({selectedBundleHash: bundleHash})
                    }
                    bundleInfo={metroHistory[bundleHash]}
                  />
                </Link>
              ))}
          </Col>
        </Row>

        {(isLoadingData || isBundling) && (
          <Icon type="loading" className={loadingIndicator} />
        )}
      </div>
    );
  }
}

const BundleCard = (props: {
  onClick: () => void,
  bundleInfo: {
    options: BundleOptions,
    builds: {[key: string]: BuildDetails},
  },
}) => {
  const entryFile = props.bundleInfo.options.entryFile;
  return (
    <Card onClick={props.onClick} className={bundleCard} hoverable={true}>
      <p className={bundleCardTitle}>
        {entryFile.substring(entryFile.lastIndexOf('/') + 1)}
        {Object.keys(props.bundleInfo.builds)
          .map(id => props.bundleInfo.builds[id])
          .filter(info => info.isInitial)
          .map(
            info =>
              info.duration != null ? (
                <span className={initalInfo} key="initial">
                  {info.duration} ms | {info.numModifiedFiles} files
                </span>
              ) : null,
          )}
      </p>

      <BundlePlots
        builds={Object.keys(props.bundleInfo.builds)
          .map(id => props.bundleInfo.builds[id])
          .filter(info => !info.isInitial && info.status === 'done')}
      />

      <Row type="flex" className={tagsRow}>
        {Object.entries(props.bundleInfo.options).map(([name, option]) => {
          if (typeof option === 'boolean' && option === true) {
            return <Tag key={name}>{name}</Tag>;
          }
          if (typeof option === 'string' && name === 'platform') {
            return <Tag key={name}>{option}</Tag>;
          }
          return null;
        })}
      </Row>
    </Card>
  );
};

injectGlobal`
  body {
    background-color: #f9f9f9;
  }
`;

const tagsRow = css`
  margin-top: 8px;
  margin-bottom: -8px;
`;

const bundleCard = css`
  width: 100%;
  margin: 8px 0px;
  word-wrap: break-word;
`;

const bundleCardTitle = css`
  font-size: 11pt;
  font-weight: 500;
`;

const logo = css`
  margin: 20px;
  height: 80px;
  width: 80px;
`;

const initalInfo = css`
  margin-left: 8px;
  font-size: 9pt;
  color: #aaa;
`;

const loadingIndicator = css`
  font-size: 4em;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translateY(-50%) translateX(-50%);
`;

module.exports = DashboardApp;
