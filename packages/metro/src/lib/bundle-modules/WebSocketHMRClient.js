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

const EventEmitter = require('eventemitter3');

import type {HmrMessage} from './types.flow';

/**
 * The Hot Module Reloading Client connects to Metro via WebSocket, to receive
 * updates from it and propagate them to the runtime to reflect the changes.
 */
class WebSocketHMRClient extends EventEmitter {
  _ws: ?WebSocket;
  _url: string;

  constructor(url: string) {
    super();
    this._url = url;
  }

  enable() {
    if (this._ws) {
      this.disable();
    }

    // Access the global WebSocket object only after enabling the client,
    // since some polyfills do the initialization lazily.
    this._ws = new global.WebSocket(this._url);
    this._ws.onopen = () => {
      this.emit('open');
    };
    this._ws.onerror = error => {
      this.emit('connection-error', error);
    };
    this._ws.onclose = () => {
      this.emit('close');
    };
    this._ws.onmessage = message => {
      const data: HmrMessage = JSON.parse(message.data);

      switch (data.type) {
        case 'update-start':
          this.emit('update-start');
          break;

        case 'update':
          this.emit('update', data.body);
          break;

        case 'update-done':
          this.emit('update-done');
          break;

        case 'error':
          this.emit('error', data.body);
          break;

        default:
          this.emit('error', {type: 'unknown-message', message: data});
      }
    };
  }

  disable() {
    if (this._ws) {
      this._ws.close();
      this._ws = undefined;
    }
  }
}

module.exports = WebSocketHMRClient;
