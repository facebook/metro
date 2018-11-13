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

const BUNDLE_CACHE_NAME = '__metroBundleCache';

/**
 * Retrieves a stringified bundle response from either the custom bundle cache
 * or the browser cache.
 */
async function getBundleResponse(request: Request): Promise<?Response> {
  const cache = await caches.open(BUNDLE_CACHE_NAME);

  const stringBundleRes = await cache.match(request);
  if (stringBundleRes != null) {
    return stringBundleRes;
  }

  return await fetch(request, {
    // This forces using the browser cache, in which the initial bundle request
    // will have been stored.
    cache: 'force-cache',
  });
}

/**
 * Stores a stringified bundle response in the custom bundle cache.
 */
async function setBundleResponse(request: Request, response: Response) {
  const cache = await caches.open(BUNDLE_CACHE_NAME);
  await cache.put(request, response);
}

module.exports = {getBundleResponse, setBundleResponse};
