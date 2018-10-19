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

const GraphNotFoundError = require('./IncrementalBundler/GraphNotFoundError');
const IncrementalBundler = require('./IncrementalBundler');
const RevisionNotFoundError = require('./IncrementalBundler/RevisionNotFoundError');

const debounceAsyncQueue = require('./lib/debounceAsyncQueue');
const formatBundlingError = require('./lib/formatBundlingError');
const getGraphId = require('./lib/getGraphId');
const hmrJSBundle = require('./DeltaBundler/Serializers/hmrJSBundle');
const nullthrows = require('nullthrows');
const parseOptionsFromUrl = require('./lib/parseOptionsFromUrl');
const splitBundleOptions = require('./lib/splitBundleOptions');
const url = require('url');

const {
  Logger: {createActionStartEntry, createActionEndEntry, log},
} = require('metro-core');

import type {RevisionId} from './IncrementalBundler';
import type {
  HmrMessage,
  HmrUpdateMessage,
  HmrErrorMessage,
} from './lib/bundle-modules/types.flow';
import type {ConfigT} from 'metro-config/src/configTypes.flow';

type Client = {|
  +send: (message: HmrMessage) => void,
  +unlisten: () => void,
  revisionId: RevisionId,
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
  _bundler: IncrementalBundler;
  _createModuleId: (path: string) => number;

  constructor(
    bundler: IncrementalBundler,
    createModuleId: (path: string) => number,
    config: ConfigT,
  ) {
    this._config = config;
    this._bundler = bundler;
    this._createModuleId = createModuleId;
  }

  async onClientConnect(
    clientUrl: string,
    sendFn: (data: string) => mixed,
  ): Promise<?Client> {
    const send = (message: HmrMessage) => {
      sendFn(JSON.stringify(message));
    };

    const urlObj = nullthrows(url.parse(clientUrl, true));
    const query = nullthrows(urlObj.query);

    let revPromise;
    if (query.bundleEntry != null) {
      // TODO(T34760695): Deprecate
      urlObj.pathname = query.bundleEntry.replace(/\.js$/, '.bundle');
      delete query.bundleEntry;

      const {options} = parseOptionsFromUrl(
        url.format(urlObj),
        this._config.projectRoot,
        new Set(this._config.resolver.platforms),
      );

      const {entryFile, transformOptions} = splitBundleOptions(options);

      const graphId = getGraphId(entryFile, transformOptions);
      revPromise = this._bundler.getRevisionByGraphId(graphId);

      if (!revPromise) {
        send({
          type: 'error',
          body: formatBundlingError(new GraphNotFoundError(graphId)),
        });
        return null;
      }
    } else {
      const revisionId = query.revisionId;
      revPromise = this._bundler.getRevision(revisionId);

      if (!revPromise) {
        send({
          type: 'error',
          body: formatBundlingError(new RevisionNotFoundError(revisionId)),
        });
        return null;
      }
    }

    const {graph, id} = await revPromise;

    const client = {
      send,
      // Listen to file changes.
      unlisten: () => unlisten(),
      revisionId: id,
    };

    const unlisten = this._bundler
      .getDeltaBundler()
      .listen(
        graph,
        debounceAsyncQueue(this._handleFileChange.bind(this, client), 50),
      );

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
    client.unlisten();
  }

  async _handleFileChange(client: Client) {
    const processingHmrChange = log(
      createActionStartEntry({action_name: 'Processing HMR change'}),
    );

    client.send({type: 'update-start'});
    const message = await this._prepareMessage(client);
    client.send(message);
    client.send({type: 'update-done'});

    log({
      ...createActionEndEntry(processingHmrChange),
      outdated_modules:
        message.type === 'update' ? message.body.delta.length : undefined,
    });
  }

  async _prepareMessage(
    client: Client,
  ): Promise<HmrUpdateMessage | HmrErrorMessage> {
    try {
      const revPromise = this._bundler.getRevision(client.revisionId);

      if (!revPromise) {
        return {
          type: 'error',
          body: formatBundlingError(
            new RevisionNotFoundError(client.revisionId),
          ),
        };
      }

      const {revision, delta} = await this._bundler.updateGraph(
        await revPromise,
        false,
      );

      client.revisionId = revision.id;

      return {
        type: 'update',
        body: {
          id: revision.id,
          delta: hmrJSBundle(delta, revision.graph, {
            createModuleId: this._createModuleId,
            projectRoot: this._config.projectRoot,
          }),
        },
      };
    } catch (error) {
      const formattedError = formatBundlingError(error);

      this._config.reporter.update({type: 'bundling_error', error});

      return {type: 'error', body: formattedError};
    }
  }
}

module.exports = HmrServer;
