/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const {Logger} = require('metro-core');

import type {BundleOptions} from 'metro/src/shared/types.flow';

export type BuildDetails = {
  status: 'started' | 'done' | 'failed',
  startTime?: [number, number],
  duration?: number,
  isInitial?: boolean,
  numModifiedFiles?: number,
  bundleSize?: number,
};

export type MetroHistory = {
  [key: string]: {
    options: BundleOptions,
    builds: {[key: string]: BuildDetails},
  },
};

const metroHistory: MetroHistory = {};

function startRecordingHistory(logger: typeof Logger) {
  logger.on('log', logEntry => {
    if (
      logEntry.bundle_hash == null ||
      logEntry.build_id == null ||
      logEntry.bundle_options == null
    ) {
      return;
    }

    if (
      logEntry.action_name === 'Requesting bundle' &&
      logEntry.action_phase === 'start'
    ) {
      recordToHistory(
        logEntry.bundle_hash,
        logEntry.bundle_options,
        logEntry.build_id,
        {
          status: 'started',
          startTime: logEntry.start_timestamp,
        },
      );
    }

    if (
      logEntry.action_name === 'Requesting bundle' &&
      logEntry.action_phase === 'end'
    ) {
      recordToHistory(
        logEntry.bundle_hash,
        logEntry.bundle_options,
        logEntry.build_id,
        {
          status: 'done',
          duration: logEntry.duration_ms,
          numModifiedFiles: logEntry.outdated_modules,
          bundleSize: logEntry.bundle_size,
        },
      );
    }

    if (logEntry.action_name === 'bundling_error') {
      recordToHistory(
        logEntry.bundle_hash,
        logEntry.bundle_options,
        logEntry.build_id,
        {
          status: 'failed',
          duration: logEntry.duration_ms,
        },
      );
    }
  });
}

function recordToHistory(
  bundleHash: string,
  options: BundleOptions,
  buildID: string,
  buildInfo: BuildDetails,
) {
  const hist = metroHistory[bundleHash];
  if (hist != null) {
    const buildHist = hist.builds[buildID];
    if (buildHist != null) {
      hist.builds[buildID] = Object.assign(buildHist, buildInfo);
    } else {
      hist.builds[buildID] = buildInfo;
    }
  } else {
    metroHistory[bundleHash] = {
      options,
      builds: {[buildID]: Object.assign(buildInfo, {isInitial: true})},
    };
  }
}

module.exports = {
  metroHistory,
  startRecordingHistory,
};
