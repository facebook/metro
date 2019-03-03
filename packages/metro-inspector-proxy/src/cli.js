/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

/**
 * Runs new HTTP Server and attaches Inspector Proxy to it.
 */

const connect = require('connect');
const http = require('http');
const yargs = require('yargs');

const {InspectorProxy} = require('./index');

yargs.option('port', {
  alias: 'p',
  describe: 'port to run inspector proxy on',
  type: 'number',
  default: 8082,
});

const inspectorProxy = new InspectorProxy();
const app = connect();
app.use(inspectorProxy.processRequest.bind(inspectorProxy));

const httpServer = http.createServer(app);
httpServer.listen((yargs.argv.port: any), '127.0.0.1', () => {
  inspectorProxy.addWebSocketListener(httpServer);
});
