/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */
'use strict';

const WebSocketHMRClient = require('./WebSocketHMRClient');

const injectDelta = require('./injectDelta');

class HMRClient extends WebSocketHMRClient {
  constructor(url: string) {
    super(url);

    this.on('update', update => {
      injectDelta(update.delta);
    });
  }
}

module.exports = HMRClient;
