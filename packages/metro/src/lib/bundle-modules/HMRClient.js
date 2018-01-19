/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @format
 */
'use strict';

const EventEmitter = require('eventemitter3');

/**
 * The Hot Module Reloading Client connects to metro via Websockets, to receive
 * updates from it and propagate them to the runtime to reflect the changes.
 */
class HMRClient extends EventEmitter {
  _wsClient: ?WebSocket;
  _url: string;

  constructor(url: string) {
    super();

    this._url = url;
  }

  enable() {
    if (this._wsClient) {
      this.disable();
    }

    // Access the global WebSocket object only after enabling the client,
    // since some polyfills do the initialization lazily.
    const WSConstructor = global.WebSocket;

    // create the WebSocket connection.
    this._wsClient = new WSConstructor(this._url);

    this._wsClient.onerror = e => {
      this.emit('connection-error', e);
    };

    this._wsClient.onmessage = message => {
      const data = JSON.parse(message.data);

      switch (data.type) {
        case 'update-start':
          this.emit('update-start');
          break;

        case 'update':
          const {modules, sourceMappingURLs, sourceURLs} = data.body;

          this.emit('update');

          modules.forEach(({id, code}, i) => {
            code += '\n\n' + sourceMappingURLs[i];

            // on JSC we need to inject from native for sourcemaps to work
            // (Safari doesn't support `sourceMappingURL` nor any variant when
            // evaluating code) but on Chrome we can simply use eval
            const injectFunction =
              typeof global.nativeInjectHMRUpdate === 'function'
                ? global.nativeInjectHMRUpdate
                : eval; // eslint-disable-line no-eval

            injectFunction(code, sourceURLs[i]);
          });
          break;

        case 'update-done':
          this.emit('update-done');
          break;

        case 'error':
          this.emit('error', {
            type: data.body.type,
            message: data.body.message,
          });
          break;

        default:
          this.emit('error', {type: 'unknown-message', message: data});
      }
    };
  }

  disable() {
    if (!this._wsClient) {
      return;
    }

    this._wsClient.close();

    this._wsClient = undefined;
  }
}

module.exports = HMRClient;
