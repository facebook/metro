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

const stringToBundle = require('./stringToBundle');

import type {Bundle} from '../types.flow';

const BUNDLE_CACHE_NAME = '__metroBundleCache';

async function getBundleFromBrowserCache(bundleReq: Request): Promise<?Bundle> {
  const res = await fetch(bundleReq, {
    // This forces using the browser cache, in which the initial bundle request
    // will have been stored.
    cache: 'force-cache',
  });

  if (!res) {
    return null;
  }

  return stringToBundle(await res.text());
}

async function getBundleFromCustomCache(
  cache: Cache,
  bundleReq: Request,
): Promise<?Bundle> {
  const res = await cache.match(bundleReq);
  if (!res) {
    return null;
  }
  return await res.json();
}

/**
 * Retrieves a bundle from either the custom bundle cache or the browser cache.
 */
async function getBundle(bundleReq: Request): Promise<?Bundle> {
  const cache = await caches.open(BUNDLE_CACHE_NAME);

  const deltaBundle = await getBundleFromCustomCache(cache, bundleReq);
  if (deltaBundle != null) {
    return deltaBundle;
  }

  return await getBundleFromBrowserCache(bundleReq);
}

/**
 * Stores a bundle in the custom bundle cache.
 */
async function setBundle(bundleReq: Request, bundle: Bundle) {
  const bundleJson = JSON.stringify(bundle);
  const bundleJsonRes = new Response(bundleJson, {
    status: 200,
    statusText: 'OK',
    headers: new Headers({
      'Content-Length': String(bundleJson.length),
      'Content-Type': 'application/json',
      Date: new Date().toUTCString(),
    }),
  });

  const cache = await caches.open(BUNDLE_CACHE_NAME);

  // Store the new initial bundle in cache. We don't need to wait for
  // this operation to complete before returning a response.
  await cache.put(bundleReq, bundleJsonRes);
}

module.exports = {getBundle, setBundle};
