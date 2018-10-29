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

import type {Bundle, DeltaBundle, HmrUpdate} from '../types.flow';

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
  +hot?: boolean,
  +getDeltaBundle?: GetDeltaBundle,
  +getHmrServerUrl?: GetHmrServerUrl,
  +onUpdate?: (clientId: string, update: HmrUpdate) => void,
|};

export type DeltaClient = (event: FetchEvent) => Promise<Response>;

async function fetchBundle(bundleReq: Request): Promise<Bundle> {
  const bundleRes = await fetch(bundleReq, {
    includeCredentials: true,
  });
  return stringToBundle(await bundleRes.text());
}

async function getOrFetchBundle(
  bundleReq: Request,
  getDeltaBundle: GetDeltaBundle,
): Promise<Bundle> {
  let bundle = await bundleCache.getBundle(bundleReq);

  if (bundle == null) {
    // We couldn't retrieve a delta bundle from either the delta cache nor the
    // browser cache. This can happen when the browser cache is cleared but the
    // service worker survives. In this case, we retrieve the original bundle.
    bundle = await fetchBundle(bundleReq);
  } else {
    try {
      const delta = await getDeltaBundle(bundleReq, bundle.revisionId);
      bundle = patchBundle(bundle, delta);
    } catch (error) {
      console.error('[SW] Error retrieving delta bundle', error);
      bundle = await fetchBundle(bundleReq);
    }
  }

  return bundle;
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
        type: 'HMR_UPDATE',
        body: update,
      });
    }
  });
}

function createDeltaClient({
  hot = false,
  getHmrServerUrl = defaultGetHmrServerUrl,
  getDeltaBundle = defaultGetDeltaBundle,
  onUpdate = defaultOnUpdate,
}: DeltaClientOptions = {}): DeltaClient {
  const updateHandlersMap = new Map();

  return async (event: FetchEvent) => {
    const clientId = event.clientId;
    const bundleReq = event.request;

    let bundle = await getOrFetchBundle(bundleReq, getDeltaBundle);

    bundleCache.setBundle(bundleReq, bundle);

    if (__DEV__ && hot) {
      const existingUpdateHandlers = updateHandlersMap.get(bundle.revisionId);
      if (existingUpdateHandlers != null) {
        existingUpdateHandlers.add(onUpdate.bind(null, clientId));
      } else {
        const updateHandlers = new Set([onUpdate.bind(null, clientId)]);
        updateHandlersMap.set(bundle.revisionId, updateHandlers);

        const hmrClient = new WebSocketHMRClient(
          getHmrServerUrl(bundleReq, bundle.revisionId),
        );

        hmrClient.on('update', update => {
          updateHandlersMap.delete(bundle.revisionId);
          updateHandlersMap.set(update.revisionId, updateHandlers);

          for (const updateHandler of updateHandlers) {
            updateHandler(update);
          }

          bundle = patchBundle(bundle, {
            base: false,
            revisionId: update.revisionId,
            modules: update.modules,
            deleted: update.deleted,
          });

          bundleCache.setBundle(bundleReq, bundle);
        });

        hmrClient.on('close', () => {
          updateHandlersMap.delete(bundle.revisionId);
        });

        hmrClient.enable();
      }
    }

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
