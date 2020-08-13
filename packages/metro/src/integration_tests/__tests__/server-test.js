/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 */

'use strict';

const Metro = require('../../..');

const execBundle = require('../execBundle');
const fetch = require('node-fetch');

jest.unmock('cosmiconfig');

jest.setTimeout(60 * 1000);

describe('Metro development server serves bundles via HTTP', () => {
  let config;
  let httpServer;

  async function downloadAndExec(path: string): mixed {
    const response = await fetch(
      'http://localhost:' + config.server.port + path,
    );

    const body = await response.text();

    if (!response.ok) {
      console.error(body);

      throw new Error('Metro responded with status code: ' + response.status);
    }

    return execBundle(body);
  }

  beforeEach(async () => {
    config = await Metro.loadConfig({
      config: require.resolve('../metro.config.js'),
    });

    httpServer = await Metro.runServer(config, {
      reporter: {update() {}},
    });
  });

  afterEach(done => {
    httpServer.close(done);
  });

  it('should serve development bundles', async () => {
    expect(
      await downloadAndExec(
        '/TestBundle.bundle?platform=ios&dev=true&minify=false',
      ),
    ).toMatchSnapshot();
  });

  it('should serve production bundles', async () => {
    expect(
      await downloadAndExec(
        '/TestBundle.bundle?platform=ios&dev=false&minify=true',
      ),
    ).toMatchSnapshot();
  });
});
