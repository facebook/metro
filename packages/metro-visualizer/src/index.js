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

const {
  metroHistory,
  startRecordingHistory,
} = require('./middleware/metroHistory');
const {initializeMiddlewareRoutes} = require('./middleware/routes');

import type Server from 'metro/src/Server';

function initializeVisualizerMiddleware(metroServer: Server) {
  startRecordingHistory(metroServer._logger);
  return initializeMiddlewareRoutes(metroServer, metroHistory);
}

module.exports = {initializeVisualizerMiddleware};
