/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

/* eslint-env browser */

'use strict';

declare var __DEV__: boolean;

const injectUpdate = require('./injectUpdate');

let info;
if (__DEV__) {
  info = (...args) => {
    // eslint-disable-next-line no-console
    console.info(...args);
  };
} else {
  info = (...args) => {};
}

function registerServiceWorker(swUrl: string) {
  if ('serviceWorker' in navigator) {
    const sw: ServiceWorkerContainer = (navigator.serviceWorker: $FlowIssue);
    window.addEventListener('load', function() {
      const registrationPromise = sw.register(swUrl);

      if (__DEV__) {
        registrationPromise.then(
          registration => {
            info(
              '[PAGE] ServiceWorker registration successful with scope: ',
              registration.scope,
            );
          },
          error => {
            console.error('[PAGE] ServiceWorker registration failed: ', error);
          },
        );
      }

      sw.addEventListener('message', event => {
        const messageEvent: ServiceWorkerMessageEvent = (event: $FlowIssue);
        switch (messageEvent.data.type) {
          case 'HMR_UPDATE': {
            if (__DEV__) {
              info(
                '[PAGE] Received HMR update from SW: ',
                messageEvent.data.body,
              );
            }

            injectUpdate(messageEvent.data.body);
          }
        }
      });
    });
  } else if (__DEV__) {
    info('[PAGE] ServiceWorker not supported');
  }
}

module.exports = registerServiceWorker;
