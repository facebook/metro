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

import type {DeltaBundle, HmrUpdate, FormattedError} from '../types.flow';

declare var __DEV__: boolean;

export type GetDeltaBundle = (
  bundleReq: Request,
  prevBundleRes: Response,
) => Promise<DeltaBundle>;

export type ShouldUpdateBundle = (
  bundleReq: Request,
  prevBundleRes: Response,
  delta: DeltaBundle,
) => boolean;

export type GetHmrServerUrl = (
  bundleReq: Request,
  prevBundleRes: Response,
) => string;

export type DeltaClientOptions = {|
  +getDeltaBundle?: GetDeltaBundle,
  +shouldUpdateBundle?: ShouldUpdateBundle,
  +getHmrServerUrl?: GetHmrServerUrl,
  +onUpdateStart?: (clientId: string) => void,
  +onUpdate?: (clientId: string, update: HmrUpdate) => void,
  +onUpdateError?: (clientId: string, error: FormattedError) => void,
|};

export type DeltaClient = (event: FetchEvent) => Promise<Response>;

const REVISION_ID_HEADER = 'X-Metro-Delta-ID';

class BundleNotFoundError extends Error {
  constructor(url: string) {
    super(
      `Couldn't retrieve a bundle corresponding to ${url} from neither the bundle cache nor the browser cache. ` +
        "This can happen when the browser cache is cleared but the service worker isn't.",
    );
  }
}

class UpdateError extends Error {
  constructor(url: string, message: string) {
    super(
      `Error retrieving update from the update server for ${url}. Try refreshing the page.\nError message: ${message}`,
    );
  }
}

class RevisionIdHeaderNotFoundError extends Error {
  constructor(url: string) {
    super(
      `The \`${REVISION_ID_HEADER}\` header is missing from Metro server's response to a request for the bundle \`${url}\`. ` +
        "If you're running the Metro server behind a proxy, make sure that you proxy headers as well.",
    );
  }
}

function defaultGetHmrServerUrl(
  bundleReq: Request,
  prevBundleRes: Response,
): string {
  const bundleUrl = new URL(bundleReq.url);
  const revisionId = prevBundleRes.headers.get(REVISION_ID_HEADER);
  if (revisionId == null) {
    throw new RevisionIdHeaderNotFoundError(bundleReq.url);
  }
  return `${bundleUrl.protocol === 'https:' ? 'wss' : 'ws'}://${
    bundleUrl.host
  }/hot?revisionId=${revisionId}`;
}

async function defaultGetDeltaBundle(
  bundleReq: Request,
  prevBundleRes: Response,
): Promise<DeltaBundle> {
  const url = new URL(bundleReq.url);
  url.pathname = url.pathname.replace(/\.(bundle|js)$/, '.delta');
  const revisionId = prevBundleRes.headers.get(REVISION_ID_HEADER);
  if (revisionId == null) {
    throw new RevisionIdHeaderNotFoundError(bundleReq.url);
  }
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

function defaultShouldUpdateBundle(
  bundleReq: Request,
  bundleRes: Response,
  delta: DeltaBundle,
) {
  return delta.revisionId !== bundleRes.headers.get(REVISION_ID_HEADER);
}

function createStringResponse(contents: string, revisionId: string): Response {
  return new Response(contents, {
    status: 200,
    statusText: 'OK',
    headers: new Headers({
      'Cache-Control': 'no-cache',
      'Content-Length': String(contents.length),
      'Content-Type': 'application/javascript',
      Date: new Date().toUTCString(),
      [REVISION_ID_HEADER]: revisionId,
    }),
  });
}

function createDeltaClient({
  getDeltaBundle = defaultGetDeltaBundle,
  shouldUpdateBundle = defaultShouldUpdateBundle,
  getHmrServerUrl = defaultGetHmrServerUrl,
  onUpdateStart = defaultOnUpdateStart,
  onUpdate = defaultOnUpdate,
  onUpdateError = defaultOnUpdateError,
}: DeltaClientOptions = {}): DeltaClient {
  if (!__DEV__) {
    return async ({request: bundleReq}: FetchEvent) => {
      const prevBundleRes = await bundleCache.getBundleResponse(bundleReq);

      if (prevBundleRes == null) {
        throw new BundleNotFoundError(bundleReq.url);
      }

      const delta = await getDeltaBundle(bundleReq, prevBundleRes);
      if (!shouldUpdateBundle(bundleReq, prevBundleRes, delta)) {
        return prevBundleRes;
      }

      const prevStringBundle = await prevBundleRes.text();
      const prevBundle = stringToBundle(prevStringBundle);
      const bundle = patchBundle(prevBundle, delta);
      const stringBundle = bundleToString(bundle, true);
      const bundleRes = createStringResponse(stringBundle, bundle.revisionId);

      bundleCache.setBundleResponse(bundleReq, bundleRes.clone());

      return bundleRes;
    };
  }

  const clients: Map<
    string,
    {|bundleResPromise: Promise<Response>, +ids: Set<string>|},
  > = new Map();

  return async ({request: bundleReq, clientId}: FetchEvent) => {
    let client = clients.get(bundleReq.url);
    if (client != null) {
      // There's already an update client running for this bundle URL.
      client.ids.add(clientId);
    } else {
      let resolveBundleRes;
      let rejectBundleRes;
      const currentClient = {
        ids: new Set([clientId]),
        bundleResPromise: new Promise((resolve, reject) => {
          resolveBundleRes = resolve;
          rejectBundleRes = reject;
        }),
      };

      clients.set(bundleReq.url, currentClient);
      client = currentClient;

      const potentialPrevBundleRes = await bundleCache.getBundleResponse(
        bundleReq,
      );

      if (potentialPrevBundleRes == null) {
        throw new BundleNotFoundError(bundleReq.url);
      }

      let prevBundleRes = potentialPrevBundleRes;

      let currentBundlePromise = prevBundleRes
        .clone()
        .text()
        .then(prevStringBundle => stringToBundle(prevStringBundle));

      const updateServerUrl = getHmrServerUrl(bundleReq, prevBundleRes);

      let resolved = false;
      const wsClient = new WebSocketHMRClient(updateServerUrl);

      wsClient.on('connection-error', error => {
        rejectBundleRes(error);
      });

      wsClient.on('close', () => {
        clients.delete(bundleReq.url);
      });

      wsClient.on('error', error => {
        if (!resolved) {
          rejectBundleRes(error);
          return;
        }
        currentClient.ids.forEach(clientId => onUpdateError(clientId, error));
      });

      wsClient.on('update-start', () => {
        currentClient.ids.forEach(clientId => onUpdateStart(clientId));
      });

      wsClient.on('update', async update => {
        if (resolved) {
          // Only notify clients for later updates.
          currentClient.ids.forEach(clientId => onUpdate(clientId, update));
        }

        const delta = {
          base: false,
          revisionId: update.revisionId,
          modules: update.modules,
          deleted: update.deleted,
        };

        let bundleRes;
        if (!shouldUpdateBundle(bundleReq, prevBundleRes, delta)) {
          bundleRes = prevBundleRes;
        } else {
          const currentBundle = patchBundle(await currentBundlePromise, delta);
          currentBundlePromise = Promise.resolve(currentBundle);

          const stringBundle = bundleToString(currentBundle, true);
          bundleRes = createStringResponse(
            stringBundle,
            currentBundle.revisionId,
          );

          bundleCache.setBundleResponse(bundleReq, bundleRes.clone());
        }

        if (!resolved) {
          resolved = true;
          resolveBundleRes(bundleRes);
        } else {
          currentClient.bundleResPromise = Promise.resolve(bundleRes);
        }

        prevBundleRes = bundleRes;
      });

      wsClient.enable();
    }

    let bundleRes;
    try {
      bundleRes = (await client.bundleResPromise).clone();
    } catch (error) {
      throw new UpdateError(bundleReq.url, error.message);
    }

    return bundleRes;
  };
}

module.exports = createDeltaClient;
