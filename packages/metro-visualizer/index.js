/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const Server = require('metro/src/Server');

const {
  metroHistory,
  startRecordingHistory,
} = require('./src/middleware/metroHistory');
const {initializeMiddlewareRoutes} = require('./src/middleware/routes');

function initializeVisualizerMiddleware(metroServer: Server) {
  startRecordingHistory(metroServer._logger);
  return initializeMiddlewareRoutes(metroServer, metroHistory);
}

module.exports = {initializeVisualizerMiddleware};
