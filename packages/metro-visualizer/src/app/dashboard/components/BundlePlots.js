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

import type {BuildDetails} from '../../../middleware/metroHistory.js';
import {
  XYPlot,
  LineMarkSeries,
  Crosshair,
  VerticalBarSeries,
  AreaSeries,
} from 'react-vis';

type Props = {builds: Array<BuildDetails>};

type State = {
  crosshairValues: Array<{x: number, y: ?number}>,
};

class BundlePlots extends React.Component<Props, State> {
  state = {
    crosshairValues: [],
  };

  handleNearestX = (value: {x: number, y: number}, data: {index: number}) => {
    const build = this.props.builds[data.index];
    this.setState({
      crosshairValues: [
        {x: data.index, y: build.duration},
        {x: data.index, y: build.bundleSize},
        {x: data.index, y: build.numModifiedFiles},
      ],
    });
  };

  render() {
    const timeData = this.props.builds.map((build, index) => ({
      x: index,
      y: build.duration,
    }));

    const buildSizes = this.props.builds.map(build =>
      build.bundleSize != null ? build.bundleSize : 0,
    );
    const minSize = Math.min(...buildSizes);
    const sizeData = buildSizes.map((size, index) => ({
      x: index,
      y: size - minSize * 0.999,
    }));

    const filesData = this.props.builds.map((build, index) => ({
      x: index,
      y: build.numModifiedFiles != null ? build.numModifiedFiles : 0,
    }));

    return (
      <div className={plotContainer}>
        <XYPlot
          width={200}
          height={100}
          onMouseLeave={() => this.setState({crosshairValues: []})}>
          <LineMarkSeries
            color="#ef4242"
            curve={'curveMonotoneX'}
            onNearestX={this.handleNearestX}
            data={timeData}
          />
          <Crosshair values={this.state.crosshairValues}>
            {this.state.crosshairValues.length > 0 && (
              <div className={crosshair} key={this.state.crosshairValues[0].x}>
                <p>{this.state.crosshairValues[0].y} ms</p>
              </div>
            )}
          </Crosshair>
        </XYPlot>

        <XYPlot
          width={200}
          height={100}
          onMouseLeave={() => this.setState({crosshairValues: []})}>
          <VerticalBarSeries
            color="#ef4242"
            curve={'curveMonotoneX'}
            onNearestX={this.handleNearestX}
            data={sizeData}
          />
          <Crosshair values={this.state.crosshairValues}>
            {this.state.crosshairValues.length > 0 &&
              typeof this.state.crosshairValues[1].y === 'number' && (
                <div
                  className={crosshair}
                  key={this.state.crosshairValues[1].x}>
                  <p>{filesize(this.state.crosshairValues[1].y)}</p>
                </div>
              )}
          </Crosshair>
        </XYPlot>

        <XYPlot
          width={200}
          height={100}
          onMouseLeave={() => this.setState({crosshairValues: []})}>
          <AreaSeries
            color="#ef4242"
            curve={'curveMonotoneX'}
            onNearestX={this.handleNearestX}
            data={filesData}
          />
          <Crosshair values={this.state.crosshairValues}>
            {this.state.crosshairValues.length > 0 && (
              <div className={crosshair} key={this.state.crosshairValues[2].x}>
                <p>{this.state.crosshairValues[2].y} files</p>
              </div>
            )}
          </Crosshair>
        </XYPlot>
      </div>
    );
  }
}

const plotContainer = css`
  width: 100%;
  height: 100;
  display: flex;
  justify-content: space-around;
`;

const crosshair = css`
  background: none;
  margin-top: 60px;
`;

module.exports = BundlePlots;
