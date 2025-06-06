/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

'use strict';

import type IncrementalBundler, {RevisionId} from './IncrementalBundler';
import type {GraphOptions} from './shared/types.flow';
import type {ConfigT, RootPerfLogger} from 'metro-config';
import type {
  HmrClientMessage,
  HmrErrorMessage,
  HmrMessage,
  HmrUpdateMessage,
} from 'metro-runtime/src/modules/types.flow';
import type {UrlWithParsedQuery} from 'url';

const hmrJSBundle = require('./DeltaBundler/Serializers/hmrJSBundle');
const GraphNotFoundError = require('./IncrementalBundler/GraphNotFoundError');
const RevisionNotFoundError = require('./IncrementalBundler/RevisionNotFoundError');
const debounceAsyncQueue = require('./lib/debounceAsyncQueue');
const formatBundlingError = require('./lib/formatBundlingError');
const getGraphId = require('./lib/getGraphId');
const parseOptionsFromUrl = require('./lib/parseOptionsFromUrl');
const splitBundleOptions = require('./lib/splitBundleOptions');
const transformHelpers = require('./lib/transformHelpers');
const {
  Logger: {createActionStartEntry, createActionEndEntry, log},
} = require('metro-core');
const nullthrows = require('nullthrows');
const url = require('url');

export type EntryPointURL = UrlWithParsedQuery;

export type Client = {
  optedIntoHMR: boolean,
  revisionIds: Array<RevisionId>,
  +sendFn: string => void,
};

type ClientGroup = {
  +clients: Set<Client>,
  clientUrl: EntryPointURL,
  revisionId: RevisionId,
  +unlisten: () => void,
  +graphOptions: GraphOptions,
};

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

  onClientConnect: (
    requestUrl: string,
    sendFn: (data: string) => void,
  ) => Promise<Client> = async (requestUrl, sendFn) => {
    return {
      sendFn,
      revisionIds: [],
      optedIntoHMR: false,
    };
  };

  async _registerEntryPoint(
    client: Client,
    requestUrl: string,
    sendFn: (data: string) => void,
  ): Promise<void> {
    requestUrl = this._config.server.rewriteRequestUrl(requestUrl);
    const clientUrl = nullthrows(url.parse(requestUrl, true));
    const {bundleType: _bundleType, ...options} = parseOptionsFromUrl(
      requestUrl,
      new Set(this._config.resolver.platforms),
    );
    const {entryFile, resolverOptions, transformOptions, graphOptions} =
      splitBundleOptions(options);

    /**
     * `entryFile` is relative to projectRoot, we need to use resolution function
     * to find the appropriate file with supported extensions.
     */
    const resolutionFn = await transformHelpers.getResolveDependencyFn(
      this._bundler.getBundler(),
      transformOptions.platform,
      resolverOptions,
    );
    const resolvedEntryFilePath = resolutionFn(
      (this._config.server.unstable_serverRoot ?? this._config.projectRoot) +
        '/.',
      {
        name: entryFile,
        data: {
          key: entryFile,
          asyncType: null,
          isESMImport: false,
          locs: [],
        },
      },
    ).filePath;
    const graphId = getGraphId(resolvedEntryFilePath, transformOptions, {
      resolverOptions,
      shallow: graphOptions.shallow,
      lazy: graphOptions.lazy,
      unstable_allowRequireContext:
        this._config.transformer.unstable_allowRequireContext,
    });
    const revPromise = this._bundler.getRevisionByGraphId(graphId);
    if (!revPromise) {
      send([sendFn], {
        type: 'error',
        body: formatBundlingError(new GraphNotFoundError(graphId)),
      });
      return;
    }

    const {graph, id} = await revPromise;
    client.revisionIds.push(id);

    let clientGroup: ?ClientGroup = this._clientGroups.get(id);
    if (clientGroup != null) {
      clientGroup.clients.add(client);
    } else {
      // Prepare the clientUrl to be used as sourceUrl in HMR updates.
      clientUrl.protocol = 'http';
      const {
        dev,
        minify,
        runModule,
        bundleEntry: _bundleEntry,
        ...query
      } = clientUrl.query || {};
      clientUrl.query = {
        ...query,
        dev: dev || 'true',
        minify: minify || 'false',
        modulesOnly: 'true',
        runModule: runModule || 'false',
        shallow: 'true',
      };
      // the legacy url object is parsed with both "search" and "query" fields.
      // for the "query" field to be used when formatting the object bach to string, the "search" field must be empty.
      // https://nodejs.org/api/url.html#urlformaturlobject:~:text=If%20the%20urlObject.search%20property%20is%20undefined
      clientUrl.search = '';

      clientGroup = {
        clients: new Set([client]),
        clientUrl,
        revisionId: id,
        graphOptions,
        unlisten: (): void => unlisten(),
      };

      this._clientGroups.set(id, clientGroup);

      let latestEventArgs: Array<any> = [];

      const debounceCallHandleFileChange = debounceAsyncQueue(async () => {
        await this._handleFileChange(
          nullthrows(clientGroup),
          {isInitialUpdate: false},
          ...latestEventArgs,
        );
      }, 50);

      const unlisten = this._bundler
        .getDeltaBundler()
        // $FlowFixMe[missing-local-annot]
        .listen(graph, async (...args) => {
          latestEventArgs = args;
          await debounceCallHandleFileChange();
        });
    }

    await this._handleFileChange(clientGroup, {isInitialUpdate: true});
    send([sendFn], {type: 'bundle-registered'});
  }

  onClientMessage: (
    client: TClient,
    message: string | Buffer | ArrayBuffer | Array<Buffer>,
    sendFn: (data: string) => void,
  ) => Promise<void> = async (client, message, sendFn) => {
    let data: HmrClientMessage;
    try {
      data = JSON.parse(String(message));
    } catch (error) {
      send([sendFn], {
        type: 'error',
        body: formatBundlingError(error),
      });
      return Promise.resolve();
    }
    if (data && data.type) {
      switch (data.type) {
        case 'register-entrypoints':
          return Promise.all(
            data.entryPoints.map(entryPoint =>
              this._registerEntryPoint(client, entryPoint, sendFn),
            ),
          );
        case 'log':
          if (this._config.server.forwardClientLogs) {
            this._config.reporter.update({
              type: 'client_log',
              level: data.level,
              data: data.data,
              mode: data.mode,
            });
          }
          break;
        case 'log-opt-in':
          client.optedIntoHMR = true;
          break;
        default:
          break;
      }
    }
    return Promise.resolve();
  };

  onClientError: (client: TClient, e: ErrorEvent) => void = (client, e) => {
    this._config.reporter.update({
      type: 'hmr_client_error',
      error: e.error,
    });
    this.onClientDisconnect(client);
  };

  onClientDisconnect: (client: TClient) => void = client => {
    client.revisionIds.forEach(revisionId => {
      const group = this._clientGroups.get(revisionId);
      if (group != null) {
        if (group.clients.size === 1) {
          this._clientGroups.delete(revisionId);
          group.unlisten();
        } else {
          group.clients.delete(client);
        }
      }
    });
  };

  async _handleFileChange(
    group: ClientGroup,
    options: {isInitialUpdate: boolean},
    changeEvent: ?{
      logger: ?RootPerfLogger,
    },
  ): Promise<void> {
    const logger = !options.isInitialUpdate ? changeEvent?.logger : null;
    if (logger) {
      logger.point('fileChange_end');
      logger.point('hmrPrepareAndSendMessage_start');
    }

    const optedIntoHMR = [...group.clients].some(
      (client: Client) => client.optedIntoHMR,
    );
    const processingHmrChange = log(
      createActionStartEntry({
        // Even when HMR is disabled on the client, this function still
        // runs so we can stash updates while it's off and apply them later.
        // However, this would mess up our internal analytics because we track
        // HMR as being used even for people who have it disabled.
        // As a workaround, we use a different event name for clients
        // that didn't explicitly opt into HMR.
        action_name: optedIntoHMR
          ? 'Processing HMR change'
          : 'Processing HMR change (no client opt-in)',
      }),
    );

    const sendFns = [...group.clients].map((client: Client) => client.sendFn);

    send(sendFns, {
      type: 'update-start',
      body: options,
    });

    const message = await this._prepareMessage(group, options, changeEvent);
    send(sendFns, message);
    send(sendFns, {type: 'update-done'});

    log({
      ...createActionEndEntry(processingHmrChange),
      outdated_modules:
        message.type === 'update'
          ? message.body.added.length + message.body.modified.length
          : undefined,
    });

    if (logger) {
      logger.point('hmrPrepareAndSendMessage_end');
      logger.end('SUCCESS');
    }
  }

  async _prepareMessage(
    group: ClientGroup,
    options: {isInitialUpdate: boolean},
    changeEvent: ?{
      logger: ?RootPerfLogger,
    },
  ): Promise<HmrUpdateMessage | HmrErrorMessage> {
    const logger = !options.isInitialUpdate ? changeEvent?.logger : null;
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

      logger?.point('updateGraph_start');

      const {revision, delta} = await this._bundler.updateGraph(
        await revPromise,
        false,
      );

      logger?.point('updateGraph_end');

      this._clientGroups.delete(group.revisionId);
      group.revisionId = revision.id;
      for (const client of group.clients) {
        client.revisionIds = client.revisionIds.filter(
          revisionId => revisionId !== group.revisionId,
        );
        client.revisionIds.push(revision.id);
      }
      this._clientGroups.set(group.revisionId, group);

      logger?.point('serialize_start');

      const hmrUpdate = hmrJSBundle(delta, revision.graph, {
        clientUrl: group.clientUrl,
        createModuleId: this._createModuleId,
        includeAsyncPaths: group.graphOptions.lazy,
        projectRoot: this._config.projectRoot,
        serverRoot:
          this._config.server.unstable_serverRoot ?? this._config.projectRoot,
      });

      logger?.point('serialize_end');

      return {
        type: 'update',
        body: {
          revisionId: revision.id,
          isInitialUpdate: options.isInitialUpdate,
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
