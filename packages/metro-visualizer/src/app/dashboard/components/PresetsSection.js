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
const URLParamsCascader = require('./URLParamsCascader');

const {css} = require('emotion');

import {Card, Col, Row, Button} from 'antd';
import type {VisualizerConfigT} from 'metro-config/src/configTypes.flow.js';
import type {RequestOptions} from 'metro/src/shared/types.flow.js';

export type Presets = $PropertyType<VisualizerConfigT, 'presets'>;
type Preset = $ElementType<Presets, number>;

export type OnBuildPresetHandler = (
  bundleName: string,
  options: $Shape<RequestOptions>,
) => void;

type Props = {|
  presets: Presets,
  platforms: $ReadOnlyArray<string>,
  onBuildPreset: OnBuildPresetHandler,
|};

const card = css`
  margin: 8px 0px;
`;

const section = css`
  margin-top: -8px;
  margin-bottom: 8px;
`;

const sectionHeading = css`
  margin-top: 16px;
  margin-bottom: 4px;
`;

const buildButton = css`
  float: right;
`;

// $FlowIssue #36262791 - missing definition for React.memo
const PresetsSection = React.memo(
  ({presets, platforms, onBuildPreset}: Props) => {
    let featuredPresets = presets.filter(preset => preset.featured);
    if (featuredPresets.length === 0) {
      featuredPresets = presets;
    }

    return (
      <div className={section}>
        <Row gutter={8} type="flex" justify="center">
          <Col span={16} className={sectionHeading}>
            Choose a bundle to build:
          </Col>
        </Row>
        <Row gutter={8} type="flex" justify="center">
          <Col span={16}>
            <Row gutter={16} type="flex" justify="start">
              {featuredPresets.map((preset, index) => {
                return (
                  <Col key={index} xs={24} md={12} xl={8}>
                    <PresetCard
                      preset={preset}
                      platforms={platforms}
                      onBuildPreset={onBuildPreset}
                    />
                  </Col>
                );
              })}
            </Row>
          </Col>
        </Row>
      </div>
    );
  },
);

const PresetCard = ({
  preset,
  platforms,
  onBuildPreset,
}: {|
  preset: Preset,
  platforms: $ReadOnlyArray<string>,
  onBuildPreset: OnBuildPresetHandler,
|}) => (
  <Card
    title={
      <>
        {preset.name}{' '}
        <URLParamsCascader
          options={getPresetBuildOptions(preset, platforms)}
          expandTrigger="hover"
          value={[]}
          onChange={params => {
            onBuildPreset(preset.entryPath, params);
          }}>
          <Button type="dashed" size="small" className={buildButton}>
            Build
          </Button>
        </URLParamsCascader>
      </>
    }
    className={card}>
    {preset.description}
  </Card>
);

function getPresetBuildOptions(preset, platforms) {
  const presetPlatforms = preset.platforms || platforms;
  if (presetPlatforms.length === 1) {
    const platform = presetPlatforms[0];
    return [
      {
        value: {
          dev: '1',
          platform,
        },
        label: `${platform}, dev`,
      },
      {
        value: {
          platform,
        },
        label: `${platform}, prod`,
      },
    ];
  }
  return presetPlatforms.map(platform => ({
    value: {platform},
    label: platform,
    children: [
      {
        value: {dev: '1'},
        label: 'dev',
      },
      {
        value: {},
        label: 'prod',
      },
    ],
  }));
}

module.exports = PresetsSection;
