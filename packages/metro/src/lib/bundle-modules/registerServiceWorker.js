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
/* eslint-disable no-console */

'use strict';

declare var __DEV__: boolean;

const injectUpdate = require('./injectUpdate');

function registerServiceWorker(swUrl: string) {
  if ('serviceWorker' in navigator) {
    const sw: ServiceWorkerContainer = (navigator.serviceWorker: $FlowIssue);
    window.addEventListener('load', function() {
      const registrationPromise = sw.register(swUrl);

      if (__DEV__) {
        registrationPromise.then(
          registration => {
            console.info(
              'ServiceWorker registration successful with scope: ',
              registration.scope,
            );
          },
          error => {
            console.error('ServiceWorker registration failed: ', error);
          },
        );

        /*'$FlowFixMe(>=0.93.0 site=react_native_fb) This
        /* comment suppresses an error found when Flow v0.93 was deployed. To see
        * the error delete this comment and run Flow. */
        sw.addEventListener('message', event => {
          const messageEvent: ServiceWorkerMessageEvent = (event: $FlowIssue);
          switch (messageEvent.data.type) {
            case 'METRO_UPDATE_START': {
              console.info('Metro update started.');
              break;
            }
            case 'METRO_UPDATE': {
              console.info('Injecting metro update:', messageEvent.data.body);
              injectUpdate(messageEvent.data.body);
              break;
            }
            case 'METRO_UPDATE_ERROR': {
              console.error('Metro update error: ', messageEvent.data.error);
              break;
            }
          }
        });
      }
    });
  } else if (__DEV__) {
    console.info('ServiceWorker not supported');
  }
}

module.exports = registerServiceWorker;
