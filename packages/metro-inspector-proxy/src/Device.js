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

import type {Page, MessageFromDevice, MessageToDevice} from './types';
import {Observable} from 'rxjs';
import WS from 'ws';

const PAGES_POLLING_INTERVAL = 1000;

const chalk = require('chalk');

/**
 * Device class represents single device connection to Inspector Proxy. Each device
 * can have multiple inspectable pages.
 */
class Device {
  // ID of the device.
  _id: number;

  // Name of the device.
  _name: string;

  // Package name of the app.
  _app: string;

  // Stores socket connection between Inspector Proxy and device.
  _deviceSocket: WS;

  // Stores last list of device's pages.
  _pages: Array<Page>;

  // Maps Page ID to debugger websocket connection for the pages that are currently
  // debugged.
  _debuggerSockets: Map<string, WS>;

  constructor(id: number, name: string, app: string, socket: WS) {
    this._id = id;
    this._name = name;
    this._app = app;
    this._pages = [];
    this._debuggerSockets = new Map();
    this._deviceSocket = socket;
    this._deviceSocket.on('message', (message: string) => {
      const parsedMessage = JSON.parse(message);
      if (parsedMessage.event !== 'getPages') {
        // eslint-disable-next-line no-console
        console.log(chalk.yellow('<- From device: ' + message));
      }
      this._handleMessageFromDevice(parsedMessage);
    });
    this._deviceSocket.on('close', () => {
      // Device disconnected - close all debugger connections.
      Array.from(this._debuggerSockets.values()).forEach((socket: WS) =>
        socket.close(),
      );
    });

    this._setPagesPolling();
  }

  getName(): string {
    return this._name;
  }

  getPagesList(): Array<Page> {
    return this._pages;
  }

  // Handles new debugger connection to this device:
  // 1. Sends connect event to device
  // 2. Forwards all messages from the debugger to device as wrappedEvent
  // 3. Sends disconnect event to device when debugger connection socket closes.
  handleDebuggerConnection(socket: WS, pageId: string) {
    this._debuggerSockets.set(pageId, socket);
    // eslint-disable-next-line no-console
    console.log(
      `Got new debugger connection for page ${pageId} of ${this._name}`,
    );

    this._sendMessageToDevice({
      event: 'connect',
      payload: {
        pageId,
      },
    });

    socket.on('message', (message: string) => {
      // eslint-disable-next-line no-console
      console.log(chalk.green('<- From debugger: ' + message));
      this._sendMessageToDevice({
        event: 'wrappedEvent',
        payload: {
          pageId,
          wrappedEvent: message,
        },
      });
    });
    socket.on('close', () => {
      // eslint-disable-next-line no-console
      console.log(
        `Debugger for page ${pageId} and ${this._name} disconnected.`,
      );
      this._sendMessageToDevice({
        event: 'disconnect',
        payload: {
          pageId,
        },
      });
    });
  }

  // Handles messages received from device:
  // 1. For getPages responses updates local _pages list.
  // 2. All other messages are forwarded to debugger as wrappedEvent.
  //
  // In the future more logic will be added to this method for modifying
  // some of the messages (like updating messages with source maps and file
  // locations).
  _handleMessageFromDevice(message: MessageFromDevice) {
    if (message.event === 'getPages') {
      this._pages = message.payload;
    } else if (message.event === 'wrappedEvent') {
      const pageId = message.payload.pageId;
      const debuggerSocket = this._debuggerSockets.get(pageId);
      if (debuggerSocket == null) {
        // TODO(hypuk): Send error back to device?
        return;
      }
      // eslint-disable-next-line no-console
      console.log(
        chalk.green('-> To debugger: ' + message.payload.wrappedEvent),
      );
      debuggerSocket.send(message.payload.wrappedEvent);
    }
  }

  // Sends single message to device.
  _sendMessageToDevice(message: MessageToDevice) {
    try {
      if (message.event !== 'getPages') {
        // eslint-disable-next-line no-console
        console.log(chalk.yellow('-> To device' + JSON.stringify(message)));
      }
      this._deviceSocket.send(JSON.stringify(message));
    } catch (error) {}
  }

  // Sends 'getPages' request to device every PAGES_POLLING_INTERVAL milliseconds.
  _setPagesPolling() {
    Observable.interval(PAGES_POLLING_INTERVAL).subscribe(_ =>
      this._sendMessageToDevice({event: 'getPages'}),
    );
  }
}

module.exports = Device;
