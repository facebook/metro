/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
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
  const bundlesDownloaded = new Set();

  async function downloadAndExec(path: string, context = {}): mixed {
    const response = await fetch(
      'http://localhost:' + config.server.port + path,
    );
    bundlesDownloaded.add(path);

    const body = await response.text();

    if (!response.ok) {
      console.error(body);

      throw new Error('Metro responded with status code: ' + response.status);
    }
    if (!context.__DOWNLOAD_AND_EXEC_FOR_TESTS__) {
      context.__DOWNLOAD_AND_EXEC_FOR_TESTS__ = p =>
        downloadAndExec(p, context);
    }
    return execBundle(body, context);
  }

  beforeEach(async () => {
    bundlesDownloaded.clear();
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

  it('should serve lazy bundles', async () => {
    const object = await downloadAndExec(
      '/import-export/index.bundle?platform=ios&dev=true&minify=false&lazy=true',
    );
    await expect(object.asyncImportCJS).resolves.toMatchSnapshot();
    await expect(object.asyncImportESM).resolves.toMatchSnapshot();
    expect(bundlesDownloaded).toEqual(
      new Set([
        '/import-export/index.bundle?platform=ios&dev=true&minify=false&lazy=true',
        '/import-export/export-6.bundle?platform=ios&dev=true&minify=false&lazy=true&modulesOnly=true&runModule=false',
        '/import-export/export-5.bundle?platform=ios&dev=true&minify=false&lazy=true&modulesOnly=true&runModule=false',
      ]),
    );
  });

  it('should serve non-lazy bundles by default', async () => {
    const object = await downloadAndExec(
      '/import-export/index.bundle?platform=ios&dev=true&minify=false',
    );
    await expect(object.asyncImportCJS).resolves.toMatchSnapshot();
    await expect(object.asyncImportESM).resolves.toMatchSnapshot();
    expect(bundlesDownloaded).toEqual(
      new Set([
        '/import-export/index.bundle?platform=ios&dev=true&minify=false',
      ]),
    );
  });

  test('responds with 404 when the bundle cannot be resolved', async () => {
    const response = await fetch(
      'http://localhost:' + config.server.port + '/doesnotexist.bundle',
    );
    expect(response.status).toBe(404);
  });

  test('responds with 500 when an import inside the bundle cannot be resolved', async () => {
    const response = await fetch(
      'http://localhost:' +
        config.server.port +
        '/build-errors/inline-requires-cannot-resolve-import.bundle',
    );
    expect(response.status).toBe(500);
  });
});
