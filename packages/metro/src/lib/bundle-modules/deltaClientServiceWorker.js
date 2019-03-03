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

const createDeltaClient = require('./DeltaClient/createDeltaClient');

const deltaClient = createDeltaClient();

self.addEventListener('fetch', event => {
  const reqUrl = new URL(event.request.url);
  if (reqUrl.pathname.match(/\.bundle$/)) {
    event.respondWith(deltaClient(event));
  }
});
