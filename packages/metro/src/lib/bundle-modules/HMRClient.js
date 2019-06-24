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
  shouldApplyUpdates: boolean = true;
  outdatedModules: Set<number> = new Set();

  constructor(url: string) {
    super(url);

    this.on('update', (update: HmrUpdate) => {
      if (this.shouldApplyUpdates) {
        injectUpdate(update);
      } else {
        // Remember if there were edits while Fast Refresh is off.
        // We'll want to warn about those modules if you turn it on.
        update.added.forEach(([id]) => this.outdatedModules.add(id));
        update.modified.forEach(([id]) => this.outdatedModules.add(id));
      }
    });
  }
}

module.exports = HMRClient;
