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
  _pendingUpdate: HmrUpdate | null = null;

  constructor(url: string) {
    super(url);

    this.on('update', (update: HmrUpdate) => {
      if (this._isEnabled) {
        injectUpdate(update);
      } else if (this._pendingUpdate == null) {
        this._pendingUpdate = update;
      } else {
        this._pendingUpdate = mergeUpdates(this._pendingUpdate, update);
      }
    });
  }

  enable() {
    this._isEnabled = true;
    const update = this._pendingUpdate;
    this._pendingUpdate = null;
    if (update != null) {
      injectUpdate(update);
    }
  }

  disable() {
    this._isEnabled = false;
  }

  isEnabled() {
    return this._isEnabled;
  }

  hasPendingUpdates() {
    return this._pendingUpdate != null;
  }
}

function mergeUpdates(base: HmrUpdate, next: HmrUpdate): HmrUpdate {
  const addedIDs = new Set();
  const deletedIDs = new Set();
  const moduleMap = new Map();
  const sourceMappingURLs = new Map();
  const sourceURLs = new Map();

  // Fill in the temporary maps and sets from both updates in their order.
  applyUpdateLocally(base);
  applyUpdateLocally(next);

  function applyUpdateLocally(update: HmrUpdate) {
    update.deleted.forEach(id => {
      if (addedIDs.has(id)) {
        addedIDs.delete(id);
      } else {
        deletedIDs.add(id);
      }
      moduleMap.delete(id);
    });
    update.added.forEach(([id, source], index) => {
      if (deletedIDs.has(id)) {
        deletedIDs.delete(id);
      } else {
        addedIDs.add(id);
      }
      moduleMap.set(id, source);
      sourceMappingURLs.set(id, update.addedSourceMappingURLs[index]);
      sourceURLs.set(id, update.addedSourceURLs[index]);
    });
    update.modified.forEach(([id, source], index) => {
      moduleMap.set(id, source);
      sourceMappingURLs.set(id, update.modifiedSourceMappingURLs[index]);
      sourceURLs.set(id, update.modifiedSourceURLs[index]);
    });
  }

  // Now reconstruct a unified update from our in-memory maps and sets.
  // Applying it should be equivalent to applying both of them individually.
  const result = {
    isInitialUpdate: next.isInitialUpdate,
    revisionId: next.revisionId,
    added: [],
    addedSourceMappingURLs: [],
    addedSourceURLs: [],
    modified: [],
    modifiedSourceMappingURLs: [],
    modifiedSourceURLs: [],
    deleted: [],
  };
  deletedIDs.forEach(id => {
    result.deleted.push(id);
  });
  moduleMap.forEach((source, id) => {
    if (deletedIDs.has(id)) {
      return;
    }
    const sourceURL = sourceURLs.get(id);
    const sourceMappingURL = sourceMappingURLs.get(id);
    if (typeof sourceURL !== 'string') {
      throw new Error('[HMRClient] Expected to find a sourceURL in the map.');
    }
    if (typeof sourceMappingURL !== 'string') {
      throw new Error('[HMRClient] Expected to find a sourceURL in the map.');
    }
    if (addedIDs.has(id)) {
      result.added.push([id, source]);
      result.addedSourceMappingURLs.push(sourceMappingURL);
      result.addedSourceURLs.push(sourceURL);
    } else {
      result.modified.push([id, source]);
      result.modifiedSourceMappingURLs.push(sourceMappingURL);
      result.modifiedSourceURLs.push(sourceURL);
    }
  });
  return result;
}

module.exports = HMRClient;
