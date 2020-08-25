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

import type {
  Page,
  MessageFromDevice,
  MessageToDevice,
  DebuggerRequest,
  DebuggerResponse,
  SetBreakpointByUrlRequest,
  GetScriptSourceRequest,
  GetScriptSourceResponse,
} from './types';
import * as fs from 'fs';
import * as path from 'path';
import WS from 'ws';

const PAGES_POLLING_INTERVAL = 1000;

const debug = require('debug')('Metro:InspectorProxy');

// Android's stock emulator and other emulators such as genymotion use a standard localhost alias.
const EMULATOR_LOCALHOST_ADDRESSES: Array<string> = ['10.0.2.2', '10.0.3.2'];

// Prefix for script URLs that are alphanumeric IDs. See comment in _processMessageFromDevice method for
// more details.
const FILE_PREFIX = 'file://';

type DebuggerInfo = {
  // Debugger web socket connection
  // $FlowFixMe[value-as-type]
  socket: WS,
  // If we replaced address (like '10.0.2.2') to localhost we need to store original
  // address because Chrome uses URL or urlRegex params (instead of scriptId) to set breakpoints.
  originalSourceURLAddress?: string,
  prependedFilePrefix: boolean,
  pageId: string,
  ...
};

const REACT_NATIVE_RELOADABLE_PAGE = {
  id: '-1',
  title: 'React Native Experimental (Improved Chrome Reloads)',
  vm: "don't use",
  app: "don't use",
};

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
  // $FlowFixMe[value-as-type]
  _deviceSocket: WS;

  // Stores last list of device's pages.
  _pages: Array<Page>;

  // Stores information about currently connected debugger (if any).
  _debuggerConnection: ?DebuggerInfo = null;

  // Last known Page ID of the React Native page.
  // This is used by debugger connections that don't have PageID specified
  // (and will interact with the latest React Native page).
  _lastReactNativePageId: ?string = null;

  // Whether we are in the middle of a reload in the REACT_NATIVE_RELOADABLE_PAGE.
  _isReloading: boolean = false;

  // The previous "GetPages" message, for deduplication in debug logs.
  _lastGetPagesMessage: string = '';

  // Mapping built from scriptParsed events and used to fetch file content in `Debugger.getScriptSource`.
  _scriptIdToSourcePathMapping: Map<string, string> = new Map();

  // Root of the project used for relative to absolute source path conversion.
  _projectRoot: string;

  constructor(
    id: number,
    name: string,
    app: string,
    // $FlowFixMe[value-as-type]
    socket: WS,
    projectRoot: string,
  ) {
    this._id = id;
    this._name = name;
    this._app = app;
    this._pages = [];
    this._deviceSocket = socket;
    this._projectRoot = projectRoot;

    this._deviceSocket.on('message', (message: string) => {
      const parsedMessage = JSON.parse(message);
      if (parsedMessage.event === 'getPages') {
        // There's a 'getPages' message every second, so only show them if they change
        if (message !== this._lastGetPagesMessage) {
          debug(
            '(Debugger)    (Proxy) <- (Device), getPages ping has changed: ' +
              message,
          );
          this._lastGetPagesMessage = message;
        }
      } else {
        debug('(Debugger)    (Proxy) <- (Device): ' + message);
      }
      this._handleMessageFromDevice(parsedMessage);
    });
    this._deviceSocket.on('close', () => {
      // Device disconnected - close debugger connection.
      if (this._debuggerConnection) {
        this._debuggerConnection.socket.close();
        this._debuggerConnection = null;
      }
    });

    this._setPagesPolling();
  }

  getName(): string {
    return this._name;
  }

  getPagesList(): Array<Page> {
    if (this._lastReactNativePageId) {
      return this._pages.concat(REACT_NATIVE_RELOADABLE_PAGE);
    } else {
      return this._pages;
    }
  }

  // Handles new debugger connection to this device:
  // 1. Sends connect event to device
  // 2. Forwards all messages from the debugger to device as wrappedEvent
  // 3. Sends disconnect event to device when debugger connection socket closes.
  // $FlowFixMe[value-as-type]
  handleDebuggerConnection(socket: WS, pageId: string) {
    // Disconnect current debugger if we already have debugger connected.
    if (this._debuggerConnection) {
      this._debuggerConnection.socket.close();
      this._debuggerConnection = null;
    }

    const debuggerInfo = {
      socket,
      prependedFilePrefix: false,
      pageId,
    };
    this._debuggerConnection = debuggerInfo;

    debug(`Got new debugger connection for page ${pageId} of ${this._name}`);

    this._sendMessageToDevice({
      event: 'connect',
      payload: {
        pageId: this._getPageId(pageId),
      },
    });

    socket.on('message', (message: string) => {
      debug('(Debugger) -> (Proxy)    (Device): ' + message);
      const debuggerRequest = JSON.parse(message);
      const interceptedResponse = this._interceptMessageFromDebugger(
        debuggerRequest,
        debuggerInfo,
      );

      if (interceptedResponse) {
        socket.send(JSON.stringify(interceptedResponse));
      } else {
        this._sendMessageToDevice({
          event: 'wrappedEvent',
          payload: {
            pageId: this._getPageId(pageId),
            wrappedEvent: JSON.stringify(debuggerRequest),
          },
        });
      }
    });
    socket.on('close', () => {
      debug(`Debugger for page ${pageId} and ${this._name} disconnected.`);
      this._sendMessageToDevice({
        event: 'disconnect',
        payload: {
          pageId: this._getPageId(pageId),
        },
      });
      this._debuggerConnection = null;
    });

    const sendFunc = socket.send;
    socket.send = function(message: string) {
      debug('(Debugger) <- (Proxy)    (Device): ' + message);
      return sendFunc.call(socket, message);
    };
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

      // Check if device have new React Native page.
      // There is usually no more than 2-3 pages per device so this operation
      // is not expensive.
      // TODO(hypuk): It is better for VM to send update event when new page is
      // created instead of manually checking this on every getPages result.
      for (let i = 0; i < this._pages.length; ++i) {
        if (this._pages[i].title.indexOf('React') >= 0) {
          if (this._pages[i].id != this._lastReactNativePageId) {
            this._newReactNativePage(this._pages[i].id);
            break;
          }
        }
      }
    } else if (message.event === 'disconnect') {
      // Device sends disconnect events only when page is reloaded or
      // if debugger socket was disconnected.
      const pageId = message.payload.pageId;
      const debuggerSocket = this._debuggerConnection
        ? this._debuggerConnection.socket
        : null;
      if (debuggerSocket && debuggerSocket.readyState === WS.OPEN) {
        if (
          this._debuggerConnection != null &&
          this._debuggerConnection.pageId !== REACT_NATIVE_RELOADABLE_PAGE.id
        ) {
          debug(`Page ${pageId} is reloading.`);
          debuggerSocket.send(JSON.stringify({method: 'reload'}));
        }
      }
    } else if (message.event === 'wrappedEvent') {
      if (this._debuggerConnection == null) {
        return;
      }

      // FIXME: Is it possible that we received message for pageID that does not
      // correspond to current debugger connection?

      const debuggerSocket = this._debuggerConnection.socket;
      if (debuggerSocket == null || debuggerSocket.readyState !== WS.OPEN) {
        // TODO(hypuk): Send error back to device?
        return;
      }

      const parsedPayload = JSON.parse(message.payload.wrappedEvent);

      if (this._debuggerConnection) {
        // Wrapping just to make flow happy :)
        this._processMessageFromDevice(parsedPayload, this._debuggerConnection);
      }

      const messageToSend = JSON.stringify(parsedPayload);
      debuggerSocket.send(messageToSend);
    }
  }

  // Sends single message to device.
  _sendMessageToDevice(message: MessageToDevice) {
    try {
      if (message.event !== 'getPages') {
        debug('(Debugger)    (Proxy) -> (Device): ' + JSON.stringify(message));
      }
      this._deviceSocket.send(JSON.stringify(message));
    } catch (error) {}
  }

  // Sends 'getPages' request to device every PAGES_POLLING_INTERVAL milliseconds.
  _setPagesPolling() {
    setInterval(
      () => this._sendMessageToDevice({event: 'getPages'}),
      PAGES_POLLING_INTERVAL,
    );
  }

  // We received new React Native Page ID.
  _newReactNativePage(pageId: string) {
    debug(`React Native page updated to ${pageId}`);
    if (
      this._debuggerConnection == null ||
      this._debuggerConnection.pageId !== REACT_NATIVE_RELOADABLE_PAGE.id
    ) {
      // We can just remember new page ID without any further actions if no
      // debugger is currently attached or attached debugger is not
      // "Reloadable React Native" connection.
      this._lastReactNativePageId = pageId;
      return;
    }
    const oldPageId = this._lastReactNativePageId;
    this._lastReactNativePageId = pageId;
    this._isReloading = true;

    // We already had a debugger connected to React Native page and a
    // new one appeared - in this case we need to emulate execution context
    // detroy and resend Debugger.enable and Runtime.enable commands to new
    // page.

    if (oldPageId != null) {
      this._sendMessageToDevice({
        event: 'disconnect',
        payload: {
          pageId: oldPageId,
        },
      });
    }

    this._sendMessageToDevice({
      event: 'connect',
      payload: {
        pageId,
      },
    });

    const toSend = [
      {method: 'Runtime.enable', id: 1e9},
      {method: 'Debugger.enable', id: 1e9},
    ];

    for (const message of toSend) {
      this._sendMessageToDevice({
        event: 'wrappedEvent',
        payload: {
          pageId: this._getPageId(pageId),
          wrappedEvent: JSON.stringify(message),
        },
      });
    }
  }

  // Allows to make changes in incoming message from device.
  _processMessageFromDevice(
    payload: {method: string, params: {sourceMapURL: string, url: string}},
    debuggerInfo: DebuggerInfo,
  ) {
    // Replace Android addresses for scriptParsed event.
    if (payload.method === 'Debugger.scriptParsed') {
      const params = payload.params || {};
      if ('sourceMapURL' in params) {
        for (let i = 0; i < EMULATOR_LOCALHOST_ADDRESSES.length; ++i) {
          const address = EMULATOR_LOCALHOST_ADDRESSES[i];
          if (params.sourceMapURL.indexOf(address) >= 0) {
            payload.params.sourceMapURL = params.sourceMapURL.replace(
              address,
              'localhost',
            );
            debuggerInfo.originalSourceURLAddress = address;
          }
        }
      }
      if ('url' in params) {
        for (let i = 0; i < EMULATOR_LOCALHOST_ADDRESSES.length; ++i) {
          const address = EMULATOR_LOCALHOST_ADDRESSES[i];
          if (params.url.indexOf(address) >= 0) {
            payload.params.url = params.url.replace(address, 'localhost');
            debuggerInfo.originalSourceURLAddress = address;
          }
        }

        // Chrome doesn't download source maps if URL param is not a valid
        // URL. Some frameworks pass alphanumeric script ID instead of URL which causes
        // Chrome to not download source maps. In this case we want to prepend script ID
        // with 'file://' prefix.
        if (payload.params.url.match(/^[0-9a-z]+$/)) {
          payload.params.url = FILE_PREFIX + payload.params.url;
          debuggerInfo.prependedFilePrefix = true;
        }

        if (params.scriptId != null) {
          this._scriptIdToSourcePathMapping.set(params.scriptId, params.url);
        }
      }

      if (debuggerInfo.pageId == REACT_NATIVE_RELOADABLE_PAGE.id) {
        // Chrome won't use the source map unless it appears to be new.
        if (payload.params.sourceMapURL) {
          payload.params.sourceMapURL +=
            '&cachePrevention=' + this._getPageId(debuggerInfo.pageId);
        }
        if (payload.params.url) {
          payload.params.url +=
            '&cachePrevention=' + this._getPageId(debuggerInfo.pageId);
        }
      }
    }

    if (
      payload.method === 'Runtime.executionContextCreated' &&
      this._isReloading
    ) {
      // The new context is ready. First notify Chrome that we've reloaded so
      // it'll resend its breakpoints. If we do this earlier, we may not be
      // ready to receive them.
      debuggerInfo.socket.send(
        JSON.stringify({method: 'Runtime.executionContextsCleared'}),
      );

      // The VM starts in a paused mode. Ask it to resume.
      // Note that if setting breakpoints in early initialization functions,
      // there's a currently race condition between these functions executing
      // and Chrome re-applying the breakpoints due to the message above.
      //
      // This is not an issue in VSCode/Nuclide where the IDE knows to resume
      // at its convenience.
      this._sendMessageToDevice({
        event: 'wrappedEvent',
        payload: {
          pageId: this._getPageId(debuggerInfo.pageId),
          wrappedEvent: JSON.stringify({method: 'Debugger.resume', id: 0}),
        },
      });

      this._isReloading = false;
    }
  }

  // Allows to make changes in incoming messages from debugger.
  _interceptMessageFromDebugger(
    req: DebuggerRequest,
    debuggerInfo: DebuggerInfo,
  ): ?DebuggerResponse {
    let response = null;
    if (req.method === 'Debugger.setBreakpointByUrl') {
      this._processDebuggerSetBreakpointByUrl(req, debuggerInfo);
    } else if (req.method === 'Debugger.getScriptSource') {
      response = {
        id: req.id,
        result: this._processDebuggerGetScriptSource(req),
      };
    }
    return response;
  }

  _processDebuggerSetBreakpointByUrl(
    req: SetBreakpointByUrlRequest,
    debuggerInfo: DebuggerInfo,
  ) {
    // If we replaced Android emulator's address to localhost we need to change it back.
    if (debuggerInfo.originalSourceURLAddress) {
      if (req.params.url) {
        req.params.url = req.params.url.replace(
          'localhost',
          debuggerInfo.originalSourceURLAddress,
        );

        if (
          req.params.url &&
          req.params.url.startsWith(FILE_PREFIX) &&
          debuggerInfo.prependedFilePrefix
        ) {
          // Remove fake URL prefix if we modified URL in _processMessageFromDevice.
          req.params.url = req.params.url.slice(FILE_PREFIX.length);
        }
      }
      if (req.params.urlRegex) {
        req.params.urlRegex = req.params.urlRegex.replace(
          /localhost/g,
          debuggerInfo.originalSourceURLAddress,
        );
      }
    }
  }

  _processDebuggerGetScriptSource(
    req: GetScriptSourceRequest,
  ): GetScriptSourceResponse {
    let scriptSource = `Source for script with id '${req.params.scriptId}' was not found.`;

    const pathToSource = this._scriptIdToSourcePathMapping.get(
      req.params.scriptId,
    );
    if (pathToSource) {
      try {
        scriptSource = fs.readFileSync(
          path.resolve(this._projectRoot, pathToSource),
          'utf8',
        );
      } catch (err) {
        scriptSource = err.message;
      }
    }

    return {
      scriptSource,
    };
  }

  _getPageId(pageId: string): string {
    if (
      pageId === REACT_NATIVE_RELOADABLE_PAGE.id &&
      this._lastReactNativePageId != null
    ) {
      return this._lastReactNativePageId;
    } else {
      return pageId;
    }
  }
}

module.exports = Device;
