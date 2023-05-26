/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

import ws from 'ws';
type WebsocketServiceInterface<T> = interface {
  +onClientConnect: (
    url: string,
    sendFn: (data: string) => void,
  ) => Promise<?T>,
  +onClientDisconnect?: (client: T) => mixed,
  +onClientError?: (client: T, e: ErrorEvent) => mixed,
  +onClientMessage?: (
    client: T,
    message: string,
    sendFn: (data: string) => void,
  ) => mixed,
};

type HMROptions<TClient> = {
  websocketServer: WebsocketServiceInterface<TClient>,
  ...
};

/**
 * Returns a WebSocketServer to be attached to an existing HTTP instance. It forwards
 * the received events on the given "websocketServer" parameter. It must be an
 * object with the following fields:
 *
 *   - onClientConnect
 *   - onClientError
 *   - onClientMessage
 *   - onClientDisconnect
 */

module.exports = function createWebsocketServer<TClient: Object>({
  websocketServer,
}: HMROptions<TClient>): typeof ws.Server {
  const wss = new ws.Server({
    noServer: true,
  });

  wss.on('connection', async (ws, req) => {
    let connected = true;
    const url = req.url;

    const sendFn = (...args: Array<string>) => {
      if (connected) {
        ws.send(...args);
      }
    };

    const client = await websocketServer.onClientConnect(url, sendFn);

    if (client == null) {
      ws.close();
      return;
    }

    ws.on('error', e => {
      websocketServer.onClientError && websocketServer.onClientError(client, e);
    });

    ws.on('close', () => {
      websocketServer.onClientDisconnect &&
        websocketServer.onClientDisconnect(client);
      connected = false;
    });

    ws.on('message', message => {
      websocketServer.onClientMessage &&
        websocketServer.onClientMessage(client, message, sendFn);
    });
  });
  return wss;
};
