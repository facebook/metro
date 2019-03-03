/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

/* eslint-env worker, serviceworker */

'use strict';

const WebSocketHMRClient = require('../WebSocketHMRClient');

const bundleCache = require('./bundleCache');
const bundleToString = require('./bundleToString');
const patchBundle = require('./patchBundle');
const stringToBundle = require('./stringToBundle');

import type {
  Bundle,
  DeltaBundle,
  HmrUpdate,
  FormattedError,
} from '../types.flow';

declare var __DEV__: boolean;

export type GetDeltaBundle = (
  bundleReq: Request,
  revisionId: string,
) => Promise<DeltaBundle>;

export type GetHmrServerUrl = (
  bundleReq: Request,
  revisionId: string,
) => string;

export type DeltaClientOptions = {|
  +getDeltaBundle?: GetDeltaBundle,
  +getHmrServerUrl?: GetHmrServerUrl,
  +onUpdateStart?: (clientId: string) => void,
  +onUpdate?: (clientId: string, update: HmrUpdate) => void,
  +onUpdateError?: (clientId: string, error: FormattedError) => void,
|};

export type DeltaClient = (event: FetchEvent) => Promise<Response>;

async function fetchBundle(bundleReq: Request): Promise<Bundle> {
  const bundleRes = await fetch(bundleReq, {
    includeCredentials: true,
  });
  return stringToBundle(await bundleRes.text());
}

function defaultGetHmrServerUrl(
  bundleReq: Request,
  revisionId: string,
): string {
  const bundleUrl = new URL(bundleReq.url);
  return `${bundleUrl.protocol === 'https:' ? 'wss' : 'ws'}://${
    bundleUrl.host
  }/hot?revisionId=${revisionId}`;
}

async function defaultGetDeltaBundle(
  bundleReq: Request,
  revisionId: string,
): Promise<DeltaBundle> {
  const url = new URL(bundleReq.url);
  url.pathname = url.pathname.replace(/\.(bundle|js)$/, '.delta');
  url.searchParams.append('revisionId', revisionId);
  const res = await fetch(url.href, {
    includeCredentials: true,
  });
  return await res.json();
}

function defaultOnUpdate(clientId: string, update: HmrUpdate) {
  clients.get(clientId).then(client => {
    if (client != null) {
      client.postMessage({
        type: 'METRO_UPDATE',
        update,
      });
    }
  });
}

function defaultOnUpdateStart(clientId: string) {
  clients.get(clientId).then(client => {
    if (client != null) {
      client.postMessage({
        type: 'METRO_UPDATE_START',
      });
    }
  });
}

function defaultOnUpdateError(clientId: string, error: FormattedError) {
  clients.get(clientId).then(client => {
    if (client != null) {
      client.postMessage({
        type: 'METRO_UPDATE_ERROR',
        error,
      });
    }
  });
}

function createDeltaClient({
  getHmrServerUrl = defaultGetHmrServerUrl,
  getDeltaBundle = defaultGetDeltaBundle,
  onUpdateStart = defaultOnUpdateStart,
  onUpdate = defaultOnUpdate,
  onUpdateError = defaultOnUpdateError,
}: DeltaClientOptions = {}): DeltaClient {
  const clientsByRevId: Map<string, Set<string>> = new Map();

  return async (event: FetchEvent) => {
    const clientId = event.clientId;
    const bundleReq: Request = event.request;

    let bundle = await bundleCache.getBundle(bundleReq);

    if (bundle == null) {
      // We couldn't retrieve a delta bundle from either the delta cache nor the
      // browser cache. This can happen when the browser cache is cleared but the
      // service worker survives. In this case, we retrieve the original bundle.
      bundle = await fetchBundle(bundleReq);
    } else if (!__DEV__) {
      try {
        const delta = await getDeltaBundle(bundleReq, bundle.revisionId);
        bundle = patchBundle(bundle, delta);
      } catch (error) {
        console.error('[SW] Error retrieving delta bundle', error);
        bundle = await fetchBundle(bundleReq);
      }
    } else {
      const clientIds = clientsByRevId.get(bundle.revisionId);
      if (clientIds != null) {
        // There's already an update client running for this particular
        // revision id.
        clientIds.add(clientId);
      } else {
        const clientIds = new Set([clientId]);
        clientsByRevId.set(bundle.revisionId, clientIds);

        try {
          let currentBundle = bundle;

          bundle = await new Promise((resolve, reject) => {
            let resolved = false;
            const wsClient = new WebSocketHMRClient(
              getHmrServerUrl(bundleReq, currentBundle.revisionId),
            );

            wsClient.on('connection-error', error => {
              reject(error);
            });

            wsClient.on('close', () => {
              clientsByRevId.delete(currentBundle.revisionId);
            });

            wsClient.on('error', error => {
              if (!resolved) {
                reject(error);
                return;
              }
              clientIds.forEach(clientId => onUpdateError(clientId, error));
            });

            wsClient.on('update-start', () => {
              clientIds.forEach(clientId => onUpdateStart(clientId));
            });

            wsClient.on('update', update => {
              if (resolved) {
                // Only notify clients for later updates.
                clientIds.forEach(clientId => onUpdate(clientId, update));
              }

              // Transfers all clients to the new revision id.
              clientsByRevId.delete(currentBundle.revisionId);
              clientsByRevId.set(update.revisionId, clientIds);

              currentBundle = patchBundle(currentBundle, {
                base: false,
                revisionId: update.revisionId,
                modules: update.modules,
                deleted: update.deleted,
              });

              bundleCache.setBundle(bundleReq, currentBundle);

              if (!resolved) {
                resolved = true;
                resolve(currentBundle);
              }
            });

            wsClient.enable();
          });
        } catch (error) {
          console.error(
            '[SW] Error connecting to the update server. Try refreshing the page.',
            error,
          );
          bundle = await fetchBundle(bundleReq);
        }
      }
    }

    bundleCache.setBundle(bundleReq, bundle);

    const bundleString = bundleToString(bundle);
    const bundleStringRes = new Response(bundleString, {
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'Cache-Control': 'no-cache',
        'Content-Length': String(bundleString.length),
        'Content-Type': 'application/javascript',
        Date: new Date().toUTCString(),
      }),
    });

    return bundleStringRes;
  };
}

module.exports = createDeltaClient;
