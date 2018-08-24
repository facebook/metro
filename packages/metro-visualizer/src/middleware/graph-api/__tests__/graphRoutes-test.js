/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @emails  oncall+javascript_foundation
 */

'use strict';

const connect = require('connect');
const request = require('supertest');
const testGraph = require('../testGraph');

const {initializeGraphRoutes} = require('../routes');
const {parse} = require('url');

const app = connect();

app.use(function query(req, res, next) {
  req.query = req.url.includes('?') ? parse(req.url, true).query : {};
  next();
});
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send(err.message);
});
app.use('/graph', initializeGraphRoutes(testGraph));

it('graph/info endpoint works correctly', async () => {
  const response = await request(app)
    .get('/graph/info')
    .expect(200);

  expect(JSON.parse(response.text)).toMatchSnapshot();
});

it('graph/modules/path(*) endpoint works correctly', async () => {
  const response = await request(app)
    .get('/graph/modules/path/to/liverpool-street.js')
    .expect(200);

  expect(JSON.parse(response.text)).toMatchSnapshot();
});

it('graph/modules/path(*)?inverse=true endpoint works correctly', async () => {
  const response = await request(app)
    .get('/graph/modules/path/to/st-paul.js?inverse=true')
    .expect(200);

  expect(JSON.parse(response.text)).toMatchSnapshot();
});

it('graph/modules/path(*)?to=...  endpoint works correctly', async () => {
  const response = await request(app)
    .get(
      '/graph/modules/path/to/liverpool-street.js?to=path/to/tottenham-court-road.js',
    )
    .expect(200);

  expect(JSON.parse(response.text)).toMatchSnapshot();
});
