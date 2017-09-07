/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 * @flow
 */

'use strict';

const getBundlingOptionsForHmr = require('./getBundlingOptionsForHmr');
const querystring = require('querystring');
const url = require('url');

import type DeltaTransformer from '../DeltaBundler/DeltaTransformer';
import type PackagerServer from '../Server';
import type {Reporter} from '../lib/reporting';

type Client = {|
  deltaTransformer: DeltaTransformer,
  sendFn: (data: string) => mixed,
|};

/**
 * The HmrServer (Hot Module Reloading) implements a lightweight interface
 * to communicate easily to the logic in the React Native repository (which
 * is the one that handles the Web Socket connections).
 *
 * This interface allows the HmrServer to hook its own logic to WS clients
 * getting connected, disconnected or having errors (through the
 * `onClientConnect`, `onClientDisconnect` and `onClientError` methods).
 */
class HmrServer<TClient: Client> {
  _packagerServer: PackagerServer;
  _reporter: Reporter;

  constructor(packagerServer: PackagerServer, reporter: Reporter) {
    this._packagerServer = packagerServer;
    this._reporter = reporter;
  }

  async onClientConnect(
    clientUrl: string,
    sendFn: (data: string) => mixed,
  ): Promise<Client> {
    const {bundleEntry, platform} = querystring.parse(
      /* $FlowFixMe: url might be null */
      url.parse(clientUrl).query,
    );

    // Create a new DeltaTransformer for each client. Once the clients are
    // modified to support Delta Bundles, they'll be able to pass the
    // DeltaBundleId param through the WS connection and we'll be able to share
    // the same DeltaTransformer between the WS connection and the HTTP one.
    const deltaBundler = this._packagerServer.getDeltaBundler();
    const {deltaTransformer} = await deltaBundler.getDeltaTransformer(
      getBundlingOptionsForHmr(bundleEntry, platform),
    );

    // Trigger an initial build to start up the DeltaTransformer.
    await deltaTransformer.getDelta();

    // Listen to file changes.
    const client = {sendFn, deltaTransformer};
    deltaTransformer.on('change', this._handleFileChange.bind(this, client));

    return client;
  }

  onClientError(client: TClient, e: Error) {
    this._reporter.update({
      type: 'hmr_client_error',
      error: e,
    });
    this.onClientDisconnect(client);
  }

  onClientDisconnect(client: TClient) {
    // We can safely remove all listeners from the delta transformer since the
    // transformer is not shared between clients.
    client.deltaTransformer.removeAllListeners('change');
  }

  async _handleFileChange(client: Client) {
    client.sendFn(JSON.stringify({type: 'update-start'}));
    client.sendFn(JSON.stringify(await this._prepareResponse(client)));
    client.sendFn(JSON.stringify({type: 'update-done'}));
  }

  async _prepareResponse(client: Client): Promise<{type: string, body: {}}> {
    const result = await client.deltaTransformer.getDelta();
    const modules = [];

    for (const id in result.delta) {
      // The Delta Bundle can have null objects: these correspond to deleted
      // modules, which we don't need to send to the client.
      if (result.delta[id] != null) {
        modules.push({id, code: result.delta[id]});
      }
    }

    return {
      type: 'update',
      body: {
        modules,
        inverseDependencies: result.inverseDependencies,
        sourceURLs: {},
        sourceMappingURLs: {}, // TODO: handle Source Maps
      },
    };
  }
}

module.exports = HmrServer;
