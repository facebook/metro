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

const injectUpdate = require('./injectUpdate');

import type {HmrUpdate} from './types.flow';

class HMRClient extends WebSocketHMRClient {
  _isEnabled: boolean = false;
  _pendingUpdates: Array<HmrUpdate> = [];

  constructor(url: string) {
    super(url);

    this.on('update', (update: HmrUpdate) => {
      if (this._isEnabled) {
        injectUpdate(update);
      } else {
        // TODO: this is inefficient because we retain
        // past versions even for the files we've edited more than once.
        this._pendingUpdates.push(update);
      }
    });
  }

  enable() {
    this._isEnabled = true;
    const pendingUpdates = this._pendingUpdates;
    this._pendingUpdates = [];
    pendingUpdates.forEach(update => injectUpdate(update));
  }

  disable() {
    this._isEnabled = false;
  }

  isEnabled() {
    return this._isEnabled;
  }

  hasPendingUpdates() {
    return this._pendingUpdates.length > 0;
  }
}

module.exports = HMRClient;
