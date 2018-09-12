/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

'use strict';

const formatBundlingError = require('./lib/formatBundlingError');
const getEntryAbsolutePath = require('./lib/getEntryAbsolutePath');
const hmrJSBundle = require('./DeltaBundler/Serializers/hmrJSBundle');
const nullthrows = require('nullthrows');
const parseCustomTransformOptions = require('./lib/parseCustomTransformOptions');
const url = require('url');

const {
  Logger: {createActionStartEntry, createActionEndEntry, log},
} = require('metro-core');

import type PackagerServer, {OutputGraph} from './Server';
import type {Reporter} from './lib/reporting';
import type {ConfigT} from 'metro-config/src/configTypes.flow';

type Client = {|
  graph: OutputGraph,
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
  _config: ConfigT;
  _packagerServer: PackagerServer;
  _reporter: Reporter;

  constructor(packagerServer: PackagerServer, config: ConfigT) {
    this._config = config;
    this._packagerServer = packagerServer;
  }

  async onClientConnect(
    clientUrl: string,
    sendFn: (data: string) => mixed,
  ): Promise<Client> {
    const urlObj = nullthrows(url.parse(clientUrl, true));

    const {bundleEntry, platform} = nullthrows(urlObj.query);
    const customTransformOptions = parseCustomTransformOptions(urlObj);

    // Create a new graph for each client. Once the clients are
    // modified to support Delta Bundles, they'll be able to pass the
    // DeltaBundleId param through the WS connection and we'll be able to share
    // the same graph between the WS connection and the HTTP one.
    const graph = await this._packagerServer.buildGraph(
      [getEntryAbsolutePath(this._config, bundleEntry)],
      {
        customTransformOptions,
        dev: true,
        hot: true,
        minify: false,
        onProgress: null,
        platform,
        type: 'module',
      },
    );

    // Listen to file changes.
    const client = {sendFn, graph};

    this._packagerServer
      .getDeltaBundler()
      .listen(graph, this._handleFileChange.bind(this, client));

    return client;
  }

  onClientError(client: TClient, e: Error) {
    this._config.reporter.update({
      type: 'hmr_client_error',
      error: e,
    });
    this.onClientDisconnect(client);
  }

  onClientDisconnect(client: TClient) {
    // We can safely stop the delta transformer since the
    // transformer is not shared between clients.
    this._packagerServer.getDeltaBundler().endGraph(client.graph);
  }

  async _handleFileChange(client: Client) {
    const processingHmrChange = log(
      createActionStartEntry({action_name: 'Processing HMR change'}),
    );

    client.sendFn(JSON.stringify({type: 'update-start'}));
    const response = await this._prepareResponse(client);

    client.sendFn(JSON.stringify(response));
    client.sendFn(JSON.stringify({type: 'update-done'}));

    log({
      ...createActionEndEntry(processingHmrChange),
      outdated_modules: Array.isArray(response.body.modules)
        ? response.body.modules.length
        : undefined,
    });
  }

  async _prepareResponse(
    client: Client,
  ): Promise<{type: string, body: Object}> {
    const deltaBundler = this._packagerServer.getDeltaBundler();

    try {
      const delta = await deltaBundler.getDelta(client.graph, {reset: false});

      this._config.serializer.experimentalSerializerHook(client.graph, delta);

      return hmrJSBundle(delta, client.graph, {
        createModuleId: this._packagerServer._createModuleId,
        projectRoot: this._config.projectRoot,
      });
    } catch (error) {
      const formattedError = formatBundlingError(error);

      this._config.reporter.update({type: 'bundling_error', error});

      return {type: 'error', body: formattedError};
    }
  }
}

module.exports = HmrServer;
