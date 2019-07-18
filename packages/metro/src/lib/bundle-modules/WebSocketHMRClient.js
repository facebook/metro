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
  _queue: Array<string> = [];
  _isOpen: boolean = false;

  constructor(url: string) {
    super();
    this._url = url;
  }

  enable(): void {
    if (this._ws) {
      throw new Error('[WebSocketHMRClient] Cannot call enable() twice.');
    }

    // Access the global WebSocket object only after enabling the client,
    // since some polyfills do the initialization lazily.
    this._ws = new global.WebSocket(this._url);
    this._ws.onopen = () => {
      this._isOpen = true;
      this.emit('open');
      this._flushQueue();
    };
    this._ws.onerror = error => {
      this.emit('connection-error', error);
    };
    this._ws.onclose = () => {
      this._isOpen = false;
      this.emit('close');
    };
    this._ws.onmessage = message => {
      const data: HmrMessage = JSON.parse(message.data);

      switch (data.type) {
        case 'bundle-registered':
          this.emit('bundle-registered');
          break;

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

  disable(): void {
    if (!this._ws) {
      throw new Error(
        '[WebSocketHMRClient] Cannot call disable() before calling enable().',
      );
    }
    this._ws.close();
  }

  send(message: string): void {
    if (this._ws && this._isOpen) {
      this._ws.send(message);
    } else {
      this._queue.push(message);
    }
  }

  _flushQueue(): void {
    this._queue.forEach(message => this.send(message));
    this._queue.length = 0;
  }
}

module.exports = WebSocketHMRClient;
