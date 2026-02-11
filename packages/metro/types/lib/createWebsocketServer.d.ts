/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import ws from 'ws';

type WebsocketServiceInterface<T> = {
  readonly onClientConnect: (
    url: string,
    sendFn: (data: string) => void,
  ) => Promise<null | undefined | T>;
  readonly onClientDisconnect?: (client: T) => unknown;
  readonly onClientError?: (client: T, e: Error) => unknown;
  readonly onClientMessage?: (
    client: T,
    message: string | Buffer | ArrayBuffer | Array<Buffer>,
    sendFn: (data: string) => void,
  ) => unknown;
};
type HMROptions<TClient> = {
  websocketServer: WebsocketServiceInterface<TClient>;
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

declare function createWebsocketServer<TClient>(
  $$PARAM_0$$: HMROptions<TClient>,
): ws.Server;
export default createWebsocketServer;
