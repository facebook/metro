/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

'use strict';

const InspectorProxy = require('./InspectorProxy');
const {parse} = require('url');
// Runs new HTTP Server and attaches Inspector Proxy to it.
// Requires are inlined here because we don't want to import them
// when someone needs only InspectorProxy instance (without starting
// new HTTP server).
function runInspectorProxy(port: number, projectRoot: string) {
  const inspectorProxy = new InspectorProxy(projectRoot);
  const app = require('connect')();
  // $FlowFixMe[method-unbinding] added when improving typing for this parameters
  app.use(inspectorProxy.processRequest.bind(inspectorProxy));

  const httpServer = require('http').createServer(app);
  httpServer.listen(port, '127.0.0.1', () => {
    const websocketEndpoints =
      inspectorProxy.createWebSocketListeners(httpServer);
    httpServer.on('upgrade', (request, socket, head) => {
      const {pathname} = parse(request.url);
      if (pathname != null && websocketEndpoints[pathname]) {
        websocketEndpoints[pathname].handleUpgrade(
          request,
          socket,
          head,
          ws => {
            websocketEndpoints[pathname].emit('connection', ws, request);
          },
        );
      } else {
        socket.destroy();
      }
    });
  });
}

module.exports = {InspectorProxy, runInspectorProxy};
