/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

const Metro = require('../../..');
const asyncHooks = require('async_hooks');

jest.unmock('cosmiconfig');

jest.useRealTimers();

describe('Server torn down test', () => {
  const active = new Map();
  const hook = asyncHooks.createHook({
    init(asyncId, type, _triggerAsyncId, resource) {
      if (
        [
          'TIMERWRAP',
          'PROMISE',
          'PerformanceObserver',
          'RANDOMBYTESREQUEST',
          'Timeout',
          'TickObject',
          'FSREQCALLBACK',
          'FSEVENTWRAP',
          'SIGNALWRAP',
        ].includes(type)
      ) {
        // these are only destroyed by garbage collector
        // so we dont expect them to be destroyed when metro is closed
        return;
      }
      active.set(asyncId, {
        type,
        callStack: new Error('mock error to get stack trace').stack,
        resource,
      });
    },
    destroy(asyncId) {
      if (active.has(asyncId)) {
        active.delete(asyncId);
      }
    },
  });

  beforeEach(() => {
    active.clear();
    hook.enable();
  });

  afterEach(() => {
    hook.disable();
  });

  test('ensures expectMetroTornDown works well', () => {
    // running it without metro being open should ensure it works
    expect(active).toEqual(new Map());
  });

  // only for macOS env.
  // if this fails it means that there's no reason anymore to wait for 100ms after fsevents stopped
  // for it's resournces to be destroyed properly and the code that does it in FSEventsWatcher can be removed
  const maybeTest = process.platform === 'darwin' ? test : test.skip;
  maybeTest(
    '[macOS (darwin) only] fsevents to be destroyed after 100ms',
    async () => {
      // $FlowFixMe[cannot-resolve-module] - Optional, Darwin only
      const fsevents = require('fsevents');

      const fsEventsWatchStopper = fsevents.watch(__filename, () => {});

      await fsEventsWatchStopper();

      // does it clear resounces properly after stopping it?
      expect(Array.from(active.values())).toEqual([
        expect.objectContaining({type: 'fsevents'}),
      ]);

      // does it clear resounces properly after a tick?
      await new Promise(resolve => process.nextTick(resolve));
      expect(Array.from(active.values())).toEqual([
        expect.objectContaining({type: 'fsevents'}),
      ]);

      // does it clear resounces properly after 100ms?
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(Array.from(active.values())).toEqual([]);
    },
  );

  test('closing should close all handlers', async () => {
    const config = await Metro.loadConfig({
      config: require.resolve('../metro.config.js'),
    });

    // to prevent a port conflict with other integration tests
    config.server.port++;

    let onCloseResolve;
    const closePromise = new Promise(resolve => (onCloseResolve = resolve));

    const httpServer = await Metro.runServer(config, {
      reporter: {update() {}},
      onClose: () => {
        onCloseResolve();
      },
    });

    httpServer.close();

    await closePromise;

    expect(Array.from(active.values())).toEqual([]);
  });
});
