/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

jest
  .useRealTimers()
  .unmock('fs')
  .unmock('graceful-fs');

const Metro = require('../..');
const path = require('path');

jasmine.DEFAULT_TIMEOUT_INTERVAL = 30 * 1000;

const INPUT_PATH = path.resolve(__dirname, '../basic_bundle');
const POLYFILLS_PATH = path.resolve(__dirname, '../../lib/polyfills');
const ASSET_REGISTRY_PATH = path.resolve(
  __dirname,
  '../basic_bundle/AssetRegistry',
);

describe('basic_bundle', () => {
  const absPathRe = new RegExp(INPUT_PATH, 'g');
  const polyfill1 = path.join(INPUT_PATH, 'polyfill-1.js');
  const polyfill2 = path.join(INPUT_PATH, 'polyfill-2.js');

  beforeEach(() => {
    jest.resetModules();

    // We replace the farm by a simple require, so that the worker sources are
    // transformed and managed by jest.
    jest.mock('jest-worker', () => {
      function Worker(workerPath, opts) {
        const {Readable} = require('stream');
        const worker = require(workerPath);
        const api = {
          getStdout: () => new Readable({read() {}}),
          getStderr: () => new Readable({read() {}}),
          end: () => (ended = true),
        };

        let ended = false;

        opts.exposedMethods.forEach(name => {
          api[name] = function() {
            if (ended) {
              throw new Error('worker farm was ended');
            }

            return worker[name].apply(null, arguments);
          };
        });

        return api;
      }

      return {
        __esModule: true,
        default: Worker,
      };
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  /**
   * On different machines and local repos the absolute paths are different so
   * we relativize them to the root of the test. We also trim the spacing inside
   * ID-based `require()` calls because the way the bundle appears to do it is
   * by replacing path strings directly by numbers in the code, not the AST.
   */
  function verifyResultCode(code) {
    expect(
      code
        .replace(absPathRe, '')
        .replace(/require\(([0-9]*) *\)/g, 'require($1)'),
    ).toMatchSnapshot();
  }

  it('bundles package with polyfills', async () => {
    const bundleWithPolyfills = await Metro.build(
      {
        assetRegistryPath: ASSET_REGISTRY_PATH,
        cacheStores: [],
        cacheVersion: '1.0',
        dynamicDepsInPackages: 'reject',
        getModulesRunBeforeMainModule: () => ['InitializeCore'],
        getPolyfills: () => [polyfill1, polyfill2],
        projectRoots: [INPUT_PATH, POLYFILLS_PATH],
        transformCache: Metro.TransformCaching.none(),
        transformModulePath: require.resolve('../../transformer'),
        nonPersistent: true,
        enableBabelRCLookup: false, // dont use metro's own babelrc!
      },
      {
        dev: false,
        entryFile: path.join(INPUT_PATH, 'TestBundle.js'),
        platform: 'ios',
      },
    );
    verifyResultCode(bundleWithPolyfills.code);
  });

  it('bundles package without polyfills', async () => {
    const bundleWithoutPolyfills = await Metro.build(
      {
        assetRegistryPath: ASSET_REGISTRY_PATH,
        cacheStores: [],
        cacheVersion: '1.0',
        dynamicDepsInPackages: 'reject',
        getModulesRunBeforeMainModule: () => ['InitializeCore'],
        getPolyfills: () => [],
        projectRoots: [INPUT_PATH, POLYFILLS_PATH],
        transformCache: Metro.TransformCaching.none(),
        transformModulePath: require.resolve('../../transformer'),
        nonPersistent: true,
        enableBabelRCLookup: false, // dont use metro's own babelrc!
      },
      {
        dev: false,
        entryFile: path.join(INPUT_PATH, 'TestBundle.js'),
        platform: 'ios',
      },
    );
    verifyResultCode(bundleWithoutPolyfills.code);
  });
});
