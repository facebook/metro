/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import type {Module, Options, Dependency} from '../types.flow';
import type {Result} from '../Graph';
import CountingSet from '../../lib/CountingSet';
import {Graph} from '../Graph';

jest.mock('../../Bundler');

const DeltaCalculator = require('../DeltaCalculator');
const {EventEmitter} = require('events');

const traverseDependencies = jest.spyOn(
  Graph.prototype,
  'traverseDependencies',
);
const initialTraverseDependencies = jest.spyOn(
  Graph.prototype,
  'initialTraverseDependencies',
);

describe('DeltaCalculator', () => {
  let entryModule: Module<$FlowFixMe>;
  let fooModule: Module<$FlowFixMe>;
  let barModule: Module<$FlowFixMe>;
  let bazModule: Module<$FlowFixMe>;
  let quxModule: Module<$FlowFixMe>;

  let deltaCalculator;
  let fileWatcher;

  const options = {
    unstable_allowRequireContext: false,
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
    initialTraverseDependencies.mockImplementationOnce(async function <T>(
      this: Graph<T>,
      options: Options<T>,
    ): Promise<Result<T>> {
      entryModule = {
        dependencies: new Map([
          [
            'foo',
            {
              absolutePath: '/foo',
              data: {
                name: 'foo',
                data: {key: 'foo', asyncType: null, locs: []},
              },
            },
          ],
          [
            'bar',
            {
              absolutePath: '/bar',
              data: {
                name: 'bar',
                data: {key: 'bar', asyncType: null, locs: []},
              },
            },
          ],
          [
            'baz',
            {
              absolutePath: '/baz',
              data: {
                name: 'baz',
                data: {key: 'baz', asyncType: null, locs: []},
              },
            },
          ],
        ]),
        inverseDependencies: new CountingSet(),
        output: [],
        path: '/bundle',
        getSource: () => Buffer.of(),
      };
      fooModule = {
        dependencies: new Map([
          [
            'qux',
            {
              absolutePath: '/qux',
              data: {
                name: 'qux',
                data: {key: 'qux', asyncType: null, locs: []},
              },
            },
          ],
        ]),
        inverseDependencies: new CountingSet(['/bundle']),
        output: [],
        path: '/foo',
        getSource: () => Buffer.of(),
      };
      barModule = {
        dependencies: new Map<string, Dependency>(),
        inverseDependencies: new CountingSet(['/bundle']),
        output: [],
        path: '/bar',
        getSource: () => Buffer.of(),
      };
      bazModule = {
        dependencies: new Map<string, Dependency>(),
        inverseDependencies: new CountingSet(['/bundle']),
        output: [],
        path: '/baz',
        getSource: () => Buffer.of(),
      };
      quxModule = {
        dependencies: new Map<string, Dependency>(),
        inverseDependencies: new CountingSet(['/foo']),
        output: [],
        path: '/qux',
        getSource: () => Buffer.of(),
      };

      this.dependencies.set('/bundle', entryModule);
      this.dependencies.set('/foo', fooModule);
      this.dependencies.set('/bar', barModule);
      this.dependencies.set('/baz', bazModule);
      this.dependencies.set('/qux', quxModule);

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

  it('should calculate a delta after a file addition', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'add', filePath: '/foo', metadata: {type: 'f'}}],
    });

    traverseDependencies.mockResolvedValueOnce({
      added: new Map([['/foo', fooModule]]),
      modified: new Map(),
      deleted: new Set(),
    });

    const result = await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(result).toEqual({
      added: new Map(),
      modified: new Map(),
      deleted: new Set(),
      reset: false,
    });

    // Not called because there were no modified files.
    expect(traverseDependencies).not.toBeCalled();
  });

  it('should calculate a delta after a simple modification', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'change', filePath: '/foo', metadata: {type: 'f'}}],
    });

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

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'change', filePath: '/foo', metadata: {type: 'f'}}],
    });

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

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'change', filePath: '/foo', metadata: {type: 'f'}}],
    });

    const quxModule: Module<$FlowFixMe> = {
      dependencies: new Map<string, Dependency>(),
      inverseDependencies: new CountingSet(),
      output: [],
      path: '/qux',
      getSource: () => Buffer.of(),
    };

    traverseDependencies.mockImplementation(async function <T>(
      this: Graph<T>,
      paths: $ReadOnlyArray<string>,
      options: Options<T>,
    ): Promise<Result<T>> {
      this.dependencies.set('/qux', quxModule);

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

  it('should emit an event when there is a relevant file change', done => {
    deltaCalculator
      .getDelta({reset: false, shallow: false})
      .then(() => {
        deltaCalculator.on('change', () => done());
        fileWatcher.emit('change', {
          eventsQueue: [
            {type: 'change', filePath: '/foo', metadata: {type: 'f'}},
          ],
        });
      })
      .catch(done);
  });

  it('should emit an event when a file is added', async () => {
    const onChangeFile = jest.fn();
    await deltaCalculator.getDelta({reset: false, shallow: false});

    deltaCalculator.on('change', onChangeFile);

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'add', filePath: '/foo', metadata: {type: 'f'}}],
    });

    jest.runAllTimers();

    expect(onChangeFile).toHaveBeenCalled();
  });

  it('should not emit an event when there is a file deleted', async () => {
    const onChangeFile = jest.fn();
    await deltaCalculator.getDelta({reset: false, shallow: false});

    deltaCalculator.on('delete', onChangeFile);

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/foo', metadata: {type: 'f'}}],
    });

    jest.runAllTimers();

    expect(onChangeFile).not.toHaveBeenCalled();
  });

  it('should retry to build the last delta after getting an error', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'change', filePath: '/foo', metadata: {type: 'f'}}],
    });

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
    fileWatcher.emit('change', {
      eventsQueue: [{type: 'change', filePath: '/foo', metadata: {type: 'f'}}],
    });

    // Then delete that same file
    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/foo', metadata: {type: 'f'}}],
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
      eventsQueue: [{type: 'delete', filePath: '/foo', metadata: {type: 'f'}}],
    });

    // Delete a dependency of the deleted file
    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/qux', metadata: {type: 'f'}}],
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
      eventsQueue: [{type: 'delete', filePath: '/foo', metadata: {type: 'f'}}],
    });

    // Then add it again
    fileWatcher.emit('change', {
      eventsQueue: [{type: 'change', filePath: '/foo', metadata: {type: 'f'}}],
    });

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
