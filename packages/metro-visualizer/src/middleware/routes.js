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

const Router = require('router');

const fs = require('fs');
const metro = require('metro');

const {initializeGraphRoutes} = require('./graph-api/routes');
const {Terminal} = require('metro-core');
const {parse} = require('url');

import type {MetroHistory} from './metroHistory.js';
import type {Graph} from 'metro/src/DeltaBundler';
import type Server from 'metro/src/Server';
import type {GraphId} from 'metro/src/lib/getGraphId';

const router = Router();
const terminal = new Terminal(process.stdout);

let metroServer: Server;
let metroHistory: MetroHistory;

function initializeMiddlewareRoutes(server: Server, history: MetroHistory) {
  metroServer = server;
  metroHistory = history;
  return router;
}

router.get('/', (req, res) => {
  const status = 'Launching visualizer';
  terminal.status(status);

  res.writeHead(200, {'Content-Type': 'text/html'});
  res.write(
    fs.readFileSync(require.resolve('metro-visualizer/src/app/index.html')),
  );
  res.end();

  terminal.status(`${status}, done.`);
  terminal.persistStatus();
});

router.use(function query(req, res, next) {
  req.query = req.url.includes('?') ? parse(req.url, true).query : {};
  next();
});

router.use('/', (err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send(err.message);
  next();
});

router.use('/graph', async (req, res, next) => {
  await getGraph(req.query.hash)
    .then(metroGraph => initializeGraphRoutes(metroGraph)(req, res, next))
    .catch(error => {
      res.writeHead(500, {'Content-Type': 'text/plain'});
      res.write((error && error.stack) || error);
      res.end();
    });
});

router.get('/bundles', async function(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.write(JSON.stringify(metroHistory));
  res.end();
});

router.get('/platforms', async function(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.write(JSON.stringify(metroServer.getPlatforms()));
  res.end();
});

router.use('/bundle.js', async (req, res, next) => {
  const status = 'Bundling visualizer app';

  const options = {
    dev: true,
    entry: './src/app/index.js',
    minify: false,
    platform: 'web',
  };

  const config = await metro.loadConfig({
    config: require.resolve('./build-utils/metro.config.js'),
  });

  await metro
    .runBuild(config, options)
    .then((val: {code: string, map: string}) => {
      terminal.status(`${status}... serving`);

      res.writeHead(200, {'Content-Type': 'text/javascript'});
      res.write(val.code);
      res.end();

      terminal.status(`${status}, done.`);
      terminal.persistStatus();
    })
    .catch(error => {
      terminal.log(error);
      terminal.status(`${status}, failed.`);
      terminal.persistStatus();
    });
});

router.get('/config', async function(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.write(JSON.stringify(metroServer.getVisualizerConfig()));
  res.end();
});

async function getGraph(graphId: GraphId): Promise<Graph<>> {
  const status = "Getting last bundle's graph";

  terminal.status(`${status}... fetching from Metro`);
  const graph = metroServer.getBundler().getRevisionByGraphId(graphId);

  if (graph == null) {
    terminal.status(`${status}, failed.`);
    terminal.persistStatus();

    throw new Error('A graph with the given hash was not found');
  }

  terminal.status(`${status}, done.`);

  return graph.then(graphRevision => graphRevision.graph);
}

module.exports = {initializeMiddlewareRoutes};
