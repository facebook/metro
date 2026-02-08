/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 *
 */

import type {
  RevisionId,
  default as IncrementalBundler,
} from './IncrementalBundler';
import type {GraphOptions} from './shared/types';
import type {ConfigT, RootPerfLogger} from 'metro-config';
import type {
  HmrErrorMessage,
  HmrUpdateMessage,
} from 'metro-runtime/src/modules/types';

export type Client = {
  optedIntoHMR: boolean;
  revisionIds: Array<RevisionId>;
  readonly sendFn: ($$PARAM_0$$: string) => void;
};
type ClientGroup = {
  readonly clients: Set<Client>;
  clientUrl: URL;
  revisionId: RevisionId;
  readonly unlisten: () => void;
  readonly graphOptions: GraphOptions;
};
/**
 * The HmrServer (Hot Module Reloading) implements a lightweight interface
 * to communicate easily to the logic in the React Native repository (which
 * is the one that handles the Web Socket connections).
 *
 * This interface allows the HmrServer to hook its own logic to WS clients
 * getting connected, disconnected or having errors (through the
 * `onClientConnect`, `onClientDisconnect` and `onClientError` methods).
 */
declare class HmrServer<TClient extends Client> {
  _config: ConfigT;
  _bundler: IncrementalBundler;
  _createModuleId: (path: string) => number;
  _clientGroups: Map<RevisionId, ClientGroup>;
  constructor(
    bundler: IncrementalBundler,
    createModuleId: (path: string) => number,
    config: ConfigT,
  );
  onClientConnect: (
    requestUrl: string,
    sendFn: (data: string) => void,
  ) => Promise<Client>;
  _registerEntryPoint(
    client: Client,
    originalRequestUrl: string,
    sendFn: (data: string) => void,
  ): Promise<void>;
  onClientMessage: (
    client: TClient,
    message: string | Buffer | ArrayBuffer | Array<Buffer>,
    sendFn: (data: string) => void,
  ) => Promise<void>;
  onClientError: (client: TClient, e: Error) => void;
  onClientDisconnect: (client: TClient) => void;
  _handleFileChange(
    group: ClientGroup,
    options: {isInitialUpdate: boolean},
    changeEvent: null | undefined | {logger: null | undefined | RootPerfLogger},
  ): Promise<void>;
  _prepareMessage(
    group: ClientGroup,
    options: {isInitialUpdate: boolean},
    changeEvent: null | undefined | {logger: null | undefined | RootPerfLogger},
  ): Promise<HmrUpdateMessage | HmrErrorMessage>;
}
export default HmrServer;
