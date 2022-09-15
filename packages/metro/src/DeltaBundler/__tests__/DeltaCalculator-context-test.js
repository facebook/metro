/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall metro_bundler
 */

'use strict';

const initialTraverseDependencies = jest.fn();
const traverseDependencies = jest.fn();
const markModifiedContextModules = jest.fn();
jest.doMock('../graphOperations', () => ({
  ...jest.requireActual('../graphOperations'),
  initialTraverseDependencies,
  traverseDependencies,
  markModifiedContextModules,
}));

const DeltaCalculator = require('../DeltaCalculator');
const {EventEmitter} = require('events');

describe('DeltaCalculator + require.context', () => {
  let deltaCalculator;
  let fileWatcher;

  const options = {
    unstable_allowRequireContext: true,
    experimentalImportBundleSupport: false,
    onProgress: null,
    resolve: (from: string, to: string) => {
      throw new Error('Never called');
    },
    shallow: false,
    transform: (modulePath: string) => {
      throw new Error('Never called');
    },
    transformOptions: {
      // NOTE: These options are ignored because we mock out the transformer (via traverseDependencies).
      dev: false,
      hot: false,
      minify: false,
      platform: null,
      runtimeBytecodeVersion: null,
      type: 'module',
      unstable_transformProfile: 'default',
    },
  };

  beforeEach(async () => {
    fileWatcher = new EventEmitter();

    markModifiedContextModules.mockImplementation(
      (graph, filePath, modifiedContexts) => {
        if (filePath.startsWith('/ctx/')) {
          modifiedContexts.add('/ctx?ctx=xxx');
        }
      },
    );

    /*
      ┌─────────┐  require.context('./ctx', ...)   ┌──────────────┐     ┌──────────┐
      │ /bundle │ ───────────────────────────────▶ │ /ctx?ctx=xxx │ ──▶ │ /ctx/foo │
      └─────────┘                                  └──────────────┘     └──────────┘
     */

    initialTraverseDependencies.mockImplementationOnce(async (graph, opt) => {
      graph.dependencies.set('/bundle', {
        dependencies: new Map([['ctx', '/ctx?ctx=xxx']]),
        inverseDependencies: [],
        output: {
          name: 'bundle',
        },
        path: '/bundle',
      });
      graph.dependencies.set('/ctx?ctx=xxx', {
        dependencies: new Map([['foo', '/ctx/foo']]),
        inverseDependencies: ['/bundle'],
        output: {
          name: 'ctx',
        },
        path: '/ctx?ctx=xxx',
      });
      graph.dependencies.set('/ctx/foo', {
        dependencies: new Map(),
        inverseDependencies: ['/ctx?ctx=xxx'],
        output: {
          name: 'foo',
        },
        path: '/ctx/foo',
      });

      return {
        added: new Map(graph.dependencies),
        modified: new Map(),
        deleted: new Set(),
      };
    });

    // We don't assert on the actual deltas, so use an empty mock.
    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map(),
        deleted: new Set(),
      }),
    );

    deltaCalculator = new DeltaCalculator(
      new Set(['/bundle']),
      fileWatcher,
      options,
    );
  });

  afterEach(() => {
    deltaCalculator.end();

    traverseDependencies.mockReset();
    initialTraverseDependencies.mockReset();
  });

  test('removing a file from a context marks the context as modified', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/ctx/foo'}],
    });

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).toBeCalledWith(
      ['/ctx?ctx=xxx'],
      deltaCalculator.getGraph(),
      expect.anything(),
    );

    // We rely on inverse dependencies to update a context module.
    expect(markModifiedContextModules).not.toBeCalled();

    expect(traverseDependencies).toBeCalledTimes(1);
  });

  test('adding a file to a context marks the context as modified', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'add', filePath: '/ctx/foo2'}],
    });

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).toBeCalledWith(
      ['/ctx?ctx=xxx'],
      deltaCalculator.getGraph(),
      expect.anything(),
    );

    expect(traverseDependencies).toBeCalledTimes(1);
  });

  test('modifying an existing file in a context does not mark the context as modified', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'change', filePath: '/ctx/foo'}],
    });

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).toBeCalledWith(
      ['/ctx/foo'],
      deltaCalculator.getGraph(),
      expect.anything(),
    );

    expect(traverseDependencies).toBeCalledTimes(1);
  });

  test('modifying a potential match of a context, without adding it, does not trigger a rebuild', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'change', filePath: '/ctx/foo2'}],
    });

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).not.toBeCalled();
  });

  test('adding a file to a context, and immediately modifying it, marks the context as modified', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'add', filePath: '/ctx/foo2'}],
    });

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'change', filePath: '/ctx/foo2'}],
    });

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).toBeCalledWith(
      ['/ctx?ctx=xxx'],
      deltaCalculator.getGraph(),
      expect.anything(),
    );

    expect(traverseDependencies).toBeCalledTimes(1);
  });

  test('adding a file to a context, and immediately removing it, does not trigger a rebuild', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'add', filePath: '/ctx/foo2'}],
    });

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/ctx/foo2'}],
    });

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).not.toBeCalled();
  });

  test('removing a file from a context, and immediately adding it back, only rebuilds the file itself', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/ctx/foo'}],
    });

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'add', filePath: '/ctx/foo'}],
    });

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).toBeCalledWith(
      ['/ctx/foo'],
      deltaCalculator.getGraph(),
      expect.anything(),
    );
  });

  test('modifying an existing file in a context, and immediately removing it, marks the context as modified', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'change', filePath: '/ctx/foo'}],
    });

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/ctx/foo'}],
    });

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).toBeCalledWith(
      ['/ctx?ctx=xxx'],
      deltaCalculator.getGraph(),
      expect.anything(),
    );

    expect(traverseDependencies).toBeCalledTimes(1);
  });
});
