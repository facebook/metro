/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 * @flow strict-local
 */

'use strict';

jest.mock('../../Bundler');
const initialTraverseDependencies = jest.fn();
const traverseDependencies = jest.fn();
const reorderGraph = jest.fn();
jest.doMock('../graphOperations', () => ({
  ...jest.requireActual('../graphOperations'),
  initialTraverseDependencies,
  traverseDependencies,
  reorderGraph,
}));

const DeltaCalculator = require('../DeltaCalculator');
const {EventEmitter} = require('events');

describe('DeltaCalculator', () => {
  let entryModule;
  let fooModule;
  let barModule;
  let bazModule;
  let quxModule;

  let deltaCalculator;
  let fileWatcher;

  const options = {
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

    initialTraverseDependencies.mockImplementationOnce(async (graph, opt) => {
      entryModule = {
        dependencies: new Map([
          ['foo', '/foo'],
          ['bar', '/bar'],
          ['baz', '/baz'],
        ]),
        inverseDependencies: [],
        output: {
          name: 'bundle',
        },
        path: '/bundle',
      };
      fooModule = {
        dependencies: new Map([['qux', '/qux']]),
        inverseDependencies: ['/bundle'],
        output: {
          name: 'foo',
        },
        path: '/foo',
      };
      barModule = {
        dependencies: new Map(),
        inverseDependencies: ['/bundle'],
        output: {
          name: 'bar',
        },
        path: '/bar',
      };
      bazModule = {
        dependencies: new Map(),
        inverseDependencies: ['/bundle'],
        output: {
          name: 'baz',
        },
        path: '/baz',
      };
      quxModule = {
        dependencies: new Map(),
        inverseDependencies: ['/foo'],
        output: {
          name: 'qux',
        },
        path: '/qux',
      };

      graph.dependencies.set('/bundle', entryModule);
      graph.dependencies.set('/foo', fooModule);
      graph.dependencies.set('/bar', barModule);
      graph.dependencies.set('/baz', bazModule);
      graph.dependencies.set('/qux', quxModule);

      return {
        added: new Map([
          ['/bundle', entryModule],
          ['/foo', fooModule],
          ['/bar', barModule],
          ['/baz', bazModule],
          ['/qux', quxModule],
        ]),
        modified: new Map(),
        deleted: new Set(),
      };
    });

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

  it('should start listening for file changes after being initialized', async () => {
    expect(fileWatcher.listeners('change')).toHaveLength(1);
  });

  it('should stop listening for file changes after being destroyed', () => {
    deltaCalculator.end();

    expect(fileWatcher.listeners('change')).toHaveLength(0);
  });

  it('should include the entry file when calculating the initial bundle', async () => {
    const result = await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(result).toEqual({
      added: new Map([
        ['/bundle', entryModule],
        ['/foo', fooModule],
        ['/bar', barModule],
        ['/baz', bazModule],
        ['/qux', quxModule],
      ]),
      modified: new Map(),
      deleted: new Set(),
      reset: true,
    });

    jest.runAllTicks();
  });

  it('should return an empty delta when there are no changes', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    expect(
      await deltaCalculator.getDelta({reset: false, shallow: false}),
    ).toEqual({
      added: new Map(),
      modified: new Map(),
      deleted: new Set(),
      reset: false,
    });

    expect(traverseDependencies.mock.calls.length).toBe(0);
  });

  it('should return a full delta when passing reset=true', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    const result = await deltaCalculator.getDelta({
      reset: true,
      shallow: false,
    });

    expect(result).toEqual({
      added: new Map([
        ['/bundle', entryModule],
        ['/foo', fooModule],
        ['/bar', barModule],
        ['/baz', bazModule],
        ['/qux', quxModule],
      ]),
      modified: new Map(),
      deleted: new Set(),
      reset: true,
    });
  });

  it('should calculate a delta after a simple modification', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {eventsQueue: [{filePath: '/foo'}]});

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map([['/foo', fooModule]]),
        deleted: new Set(),
      }),
    );

    const result = await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(result).toEqual({
      added: new Map(),
      modified: new Map([['/foo', fooModule]]),
      deleted: new Set(),
      reset: false,
    });

    expect(traverseDependencies.mock.calls.length).toBe(1);
  });

  it('should calculate a delta after removing a dependency', async () => {
    // Get initial delta
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {eventsQueue: [{filePath: '/foo'}]});

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map([['/foo', fooModule]]),
        deleted: new Set(['/baz']),
      }),
    );

    const result = await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(result).toEqual({
      added: new Map(),
      modified: new Map([['/foo', fooModule]]),
      deleted: new Set(['/baz']),
      reset: false,
    });

    expect(traverseDependencies.mock.calls.length).toBe(1);
  });

  it('should calculate a delta after adding/removing dependencies', async () => {
    // Get initial delta
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {eventsQueue: [{filePath: '/foo'}]});

    const quxModule = {
      dependencies: new Map(),
      inverseDependencies: [],
      output: {name: 'qux'},
      path: '/qux',
    };

    traverseDependencies.mockImplementation(async (path, graph, options) => {
      graph.dependencies.set('/qux', quxModule);

      return {
        added: new Map(),
        modified: new Map([
          ['/foo', fooModule],
          ['/qux', quxModule],
        ]),
        deleted: new Set(['/bar', '/baz']),
      };
    });

    const result = await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });
    expect(result).toEqual({
      added: new Map([]),
      modified: new Map([
        ['/foo', fooModule],
        ['/qux', quxModule],
      ]),
      deleted: new Set(['/bar', '/baz']),
      reset: false,
    });
  });

  it('should emit an event when there is a relevant file change', async done => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    deltaCalculator.on('change', () => done());

    fileWatcher.emit('change', {eventsQueue: [{filePath: '/foo'}]});
  });

  it('should not emit an event when there is a file deleted', async () => {
    jest.useFakeTimers();

    const onChangeFile = jest.fn();
    await deltaCalculator.getDelta({reset: false, shallow: false});

    deltaCalculator.on('delete', onChangeFile);

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/foo'}],
    });

    jest.runAllTimers();

    expect(onChangeFile).not.toHaveBeenCalled();
  });

  it('should retry to build the last delta after getting an error', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {eventsQueue: [{filePath: '/foo'}]});

    traverseDependencies.mockReturnValue(Promise.reject(new Error()));

    await expect(
      deltaCalculator.getDelta({reset: false, shallow: false}),
    ).rejects.toBeInstanceOf(Error);

    // This second time it should still throw an error.
    await expect(
      deltaCalculator.getDelta({reset: false, shallow: false}),
    ).rejects.toBeInstanceOf(Error);
  });

  it('should never try to traverse a file after deleting it', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    // First modify the file
    fileWatcher.emit('change', {eventsQueue: [{filePath: '/foo'}]});

    // Then delete that same file
    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/foo'}],
    });

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map([['/bundle', entryModule]]),
        deleted: new Set(['/foo']),
      }),
    );

    expect(
      await deltaCalculator.getDelta({reset: false, shallow: false}),
    ).toEqual({
      added: new Map(),
      modified: new Map([['/bundle', entryModule]]),
      deleted: new Set(['/foo']),
      reset: false,
    });

    expect(traverseDependencies).toHaveBeenCalledTimes(1);
    expect(traverseDependencies.mock.calls[0][0]).toEqual(['/bundle']);
  });

  it('does not traverse a file after deleting it and one of its dependencies', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    // Delete a file
    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/foo'}],
    });

    // Delete a dependency of the deleted file
    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/qux'}],
    });

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map([['/bundle', entryModule]]),
        deleted: new Set(['/foo']),
      }),
    );

    await deltaCalculator.getDelta({reset: false, shallow: false});

    // Only the /bundle module should have been traversed (since it's an
    // inverse dependency of /foo).
    expect(traverseDependencies).toHaveBeenCalledTimes(1);
    expect(traverseDependencies.mock.calls[0][0]).toEqual(['/bundle']);
  });

  it('should not do unnecessary work when adding a file after deleting it', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    // First delete a file
    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/foo'}],
    });

    // Then add it again
    fileWatcher.emit('change', {eventsQueue: [{filePath: '/foo'}]});

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map([['/foo', entryModule]]),
        deleted: new Set(),
      }),
    );

    await deltaCalculator.getDelta({reset: false, shallow: false});

    expect(traverseDependencies).toHaveBeenCalledTimes(1);
    expect(traverseDependencies.mock.calls[0][0]).toEqual(['/foo']);
  });

  it('should not mutate an existing graph when calling end()', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});
    const graph = deltaCalculator.getGraph();

    const numDependencies = graph.dependencies.size;

    deltaCalculator.end();

    expect(graph.dependencies.size).toEqual(numDependencies);
  });
});
