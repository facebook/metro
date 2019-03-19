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
const transformHelpers = require('./lib/transformHelpers');
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
  +sendFn: string => void,
  revisionId: RevisionId,
|};

type ClientGroup = {|
  +clients: Set<Client>,
  +unlisten: () => void,
  revisionId: RevisionId,
|};

function send(sendFns: Array<(string) => void>, message: HmrMessage): void {
  const strMessage = JSON.stringify(message);
  sendFns.forEach((sendFn: string => void) => sendFn(strMessage));
}

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
  _clientGroups: Map<RevisionId, ClientGroup>;

  constructor(
    bundler: IncrementalBundler,
    createModuleId: (path: string) => number,
    config: ConfigT,
  ) {
    this._config = config;
    this._bundler = bundler;
    this._createModuleId = createModuleId;
    this._clientGroups = new Map();
  }

  async onClientConnect(
    clientUrl: string,
    sendFn: (data: string) => void,
  ): Promise<?Client> {
    const urlObj = nullthrows(url.parse(clientUrl, true));
    const query = nullthrows(urlObj.query);

    let revPromise;
    if (query.bundleEntry != null) {
      // TODO(T34760695): Deprecate
      urlObj.pathname = query.bundleEntry.replace(/\.js$/, '.bundle');
      delete query.bundleEntry;

      const {options} = parseOptionsFromUrl(
        url.format(urlObj),
        new Set(this._config.resolver.platforms),
      );

      const {entryFile, transformOptions} = splitBundleOptions(options);

      /**
       * `entryFile` is relative to projectRoot, we need to use resolution function
       * to find the appropriate file with supported extensions.
       */
      const resolutionFn = await transformHelpers.getResolveDependencyFn(
        this._bundler.getBundler(),
        transformOptions.platform,
      );
      const resolvedEntryFilePath = resolutionFn(
        `${this._config.projectRoot}/.`,
        entryFile,
      );
      const graphId = getGraphId(resolvedEntryFilePath, transformOptions);
      revPromise = this._bundler.getRevisionByGraphId(graphId);

      if (!revPromise) {
        send([sendFn], {
          type: 'error',
          body: formatBundlingError(new GraphNotFoundError(graphId)),
        });
        return null;
      }
    } else {
      const revisionId = query.revisionId;
      revPromise = this._bundler.getRevision(revisionId);

      if (!revPromise) {
        send([sendFn], {
          type: 'error',
          body: formatBundlingError(new RevisionNotFoundError(revisionId)),
        });
        return null;
      }
    }

    const {graph, id} = await revPromise;

    const client = {
      sendFn,
      revisionId: id,
    };

    let clientGroup = this._clientGroups.get(id);
    if (clientGroup != null) {
      clientGroup.clients.add(client);
    } else {
      clientGroup = {
        clients: new Set([client]),
        unlisten: (): void => unlisten(),
        revisionId: id,
      };

      this._clientGroups.set(id, clientGroup);

      const unlisten = this._bundler
        .getDeltaBundler()
        .listen(
          graph,
          debounceAsyncQueue(
            this._handleFileChange.bind(this, clientGroup),
            50,
          ),
        );
    }

    await this._handleFileChange(clientGroup);

    return client;
  }

  onClientError(client: TClient, e: Error): void {
    this._config.reporter.update({
      type: 'hmr_client_error',
      error: e,
    });
    this.onClientDisconnect(client);
  }

  onClientDisconnect(client: TClient): void {
    const group = this._clientGroups.get(client.revisionId);
    if (group != null) {
      if (group.clients.size === 1) {
        this._clientGroups.delete(client.revisionId);
        group.unlisten();
      } else {
        group.clients.delete(client);
      }
    }
  }

  async _handleFileChange(group: ClientGroup): Promise<void> {
    const processingHmrChange = log(
      createActionStartEntry({action_name: 'Processing HMR change'}),
    );

    const sendFns = [...group.clients].map((client: Client) => client.sendFn);

    send(sendFns, {type: 'update-start'});
    const message = await this._prepareMessage(group);
    send(sendFns, message);
    send(sendFns, {type: 'update-done'});

    log({
      ...createActionEndEntry(processingHmrChange),
      outdated_modules:
        message.type === 'update'
          ? message.body.added.length + message.body.modified.length
          : undefined,
    });
  }

  async _prepareMessage(
    group: ClientGroup,
  ): Promise<HmrUpdateMessage | HmrErrorMessage> {
    try {
      const revPromise = this._bundler.getRevision(group.revisionId);

      if (!revPromise) {
        return {
          type: 'error',
          body: formatBundlingError(
            new RevisionNotFoundError(group.revisionId),
          ),
        };
      }

      const {revision, delta} = await this._bundler.updateGraph(
        await revPromise,
        false,
      );

      this._clientGroups.delete(group.revisionId);
      group.revisionId = revision.id;
      for (const client of group.clients) {
        client.revisionId = revision.id;
      }
      this._clientGroups.set(group.revisionId, group);

      const hmrUpdate = hmrJSBundle(delta, revision.graph, {
        createModuleId: this._createModuleId,
        projectRoot: this._config.projectRoot,
      });

      return {
        type: 'update',
        body: {
          revisionId: revision.id,
          ...hmrUpdate,
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
