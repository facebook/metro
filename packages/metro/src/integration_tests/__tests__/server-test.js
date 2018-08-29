/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

const Metro = require('../../..');

const fetch = require('node-fetch');

jest.unmock('cosmiconfig');

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60 * 1000;

it('should create a server', async () => {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });

  const httpServer = await Metro.runServer(config, {
    reporter: {update() {}},
  });

  try {
    const response = await fetch(
      `http://localhost:${
        config.server.port
      }/TestBundle.bundle?platform=ios&dev=false&minify=true`,
    );

    const body = await response.text();

    if (!response.ok) {
      console.error(body);
      throw new Error(
        'Metro server responded with status code: ' + response.status,
      );
    }

    expect(body.replace(/https?:\/\/[^:]+:[0-9]+/g, '')).toMatchSnapshot();
  } finally {
    httpServer.close();
  }
});
