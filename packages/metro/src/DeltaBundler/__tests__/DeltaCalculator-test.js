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

import type {Graph as GraphType, Result} from '../Graph';
import type {
  Dependency,
  Module,
  Options,
  TransformResultDependency,
} from '../types.flow';

import CountingSet from '../../lib/CountingSet';
import path from 'path';

jest.mock('../../Bundler');

describe.each(['linux', 'win32'])('DeltaCalculator (%s)', osPlatform => {
  let entryModule: Module<$FlowFixMe>;
  let fooModule: Module<$FlowFixMe>;
  let barModule: Module<$FlowFixMe>;
  let bazModule: Module<$FlowFixMe>;
  let quxModule: Module<$FlowFixMe>;

  let deltaCalculator;
  let fileWatcher;
  let traverseDependencies;
  let initialTraverseDependencies;

  const options = {
    unstable_allowRequireContext: false,
    unstable_enablePackageExports: true,
    lazy: false,
    onProgress: null,
    resolve: (from: string, to: TransformResultDependency) => {
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
      type: 'module',
      unstable_transformProfile: 'default',
    },
  };

  function p(posixPath: string): string {
    if (osPlatform === 'win32') {
      return path.win32.join('C:\\', ...posixPath.split('/'));
    }

    return posixPath;
  }

  beforeEach(async () => {
    if (osPlatform === 'win32') {
      jest.doMock('path', () => jest.requireActual('path/win32'));
    } else {
      jest.doMock('path', () => jest.requireActual('path'));
    }

    const {EventEmitter} = require('events');
    const {Graph} = require('../Graph');

    traverseDependencies = jest.spyOn(Graph.prototype, 'traverseDependencies');
    initialTraverseDependencies = jest.spyOn(
      Graph.prototype,
      'initialTraverseDependencies',
    );

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
              absolutePath: p('/foo'),
              data: {
                name: 'foo',
                data: {key: 'foo', asyncType: null, locs: []},
              },
            },
          ],
          [
            'bar',
            {
              absolutePath: p('/bar'),
              data: {
                name: 'bar',
                data: {key: 'bar', asyncType: null, locs: []},
              },
            },
          ],
          [
            'baz',
            {
              absolutePath: p('/baz'),
              data: {
                name: 'baz',
                data: {key: 'baz', asyncType: null, locs: []},
              },
            },
          ],
        ]),
        inverseDependencies: new CountingSet(),
        output: [],
        path: p('/bundle'),
        getSource: () => Buffer.of(),
      };
      fooModule = {
        dependencies: new Map([
          [
            'qux',
            {
              absolutePath: p('/qux'),
              data: {
                name: 'qux',
                data: {key: 'qux', asyncType: null, locs: []},
              },
            },
          ],
        ]),
        inverseDependencies: new CountingSet([p('/bundle')]),
        output: [],
        path: p('/foo'),
        getSource: () => Buffer.of(),
      };
      barModule = {
        dependencies: new Map<string, Dependency>(),
        inverseDependencies: new CountingSet([p('/bundle')]),
        output: [],
        path: p('/bar'),
        getSource: () => Buffer.of(),
      };
      bazModule = {
        dependencies: new Map<string, Dependency>(),
        inverseDependencies: new CountingSet([p('/bundle')]),
        output: [],
        path: p('/baz'),
        getSource: () => Buffer.of(),
      };
      quxModule = {
        dependencies: new Map<string, Dependency>(),
        inverseDependencies: new CountingSet([p('/foo')]),
        output: [],
        path: p('/qux'),
        getSource: () => Buffer.of(),
      };

      this.dependencies.set(p('/bundle'), entryModule);
      this.dependencies.set(p('/foo'), fooModule);
      this.dependencies.set(p('/bar'), barModule);
      this.dependencies.set(p('/baz'), bazModule);
      this.dependencies.set(p('/qux'), quxModule);

      return {
        added: new Map([
          [p('/bundle'), entryModule],
          [p('/foo'), fooModule],
          [p('/bar'), barModule],
          [p('/baz'), bazModule],
          [p('/qux'), quxModule],
        ]),
        modified: new Map(),
        deleted: new Set(),
      };
    });

    const DeltaCalculator = require('../DeltaCalculator');

    // $FlowFixMe[underconstrained-implicit-instantiation]
    deltaCalculator = new DeltaCalculator(
      new Set([p('/bundle')]),
      fileWatcher,
      options,
    );
  });

  afterEach(() => {
    deltaCalculator.end();

    traverseDependencies.mockReset();
    initialTraverseDependencies.mockReset();
    jest.resetModules();
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
        [p('/bundle'), entryModule],
        [p('/foo'), fooModule],
        [p('/bar'), barModule],
        [p('/baz'), bazModule],
        [p('/qux'), quxModule],
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
        [p('/bundle'), entryModule],
        [p('/foo'), fooModule],
        [p('/bar'), barModule],
        [p('/baz'), bazModule],
        [p('/qux'), quxModule],
      ]),
      modified: new Map(),
      deleted: new Set(),
      reset: true,
    });
  });

  it('should calculate a delta after a file addition', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'add', filePath: p('/foo'), metadata: {type: 'f'}}],
    });

    traverseDependencies.mockResolvedValueOnce({
      added: new Map([[p('/foo'), fooModule]]),
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
      eventsQueue: [
        {type: 'change', filePath: p('/foo'), metadata: {type: 'f'}},
      ],
    });

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map([[p('/foo'), fooModule]]),
        deleted: new Set(),
      }),
    );

    const result = await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(result).toEqual({
      added: new Map(),
      modified: new Map([[p('/foo'), fooModule]]),
      deleted: new Set(),
      reset: false,
    });

    expect(traverseDependencies.mock.calls.length).toBe(1);
  });

  it('should calculate a delta after removing a dependency', async () => {
    // Get initial delta
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [
        {type: 'change', filePath: p('/foo'), metadata: {type: 'f'}},
      ],
    });

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map([[p('/foo'), fooModule]]),
        deleted: new Set([p('/baz')]),
      }),
    );

    const result = await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(result).toEqual({
      added: new Map(),
      modified: new Map([[p('/foo'), fooModule]]),
      deleted: new Set([p('/baz')]),
      reset: false,
    });

    expect(traverseDependencies.mock.calls.length).toBe(1);
  });

  it('should calculate a delta after adding/removing dependencies', async () => {
    // Get initial delta
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [
        {type: 'change', filePath: p('/foo'), metadata: {type: 'f'}},
      ],
    });

    const quxModule: Module<$FlowFixMe> = {
      dependencies: new Map<string, Dependency>(),
      inverseDependencies: new CountingSet(),
      output: [],
      path: p('/qux'),
      getSource: () => Buffer.of(),
    };

    traverseDependencies.mockImplementation(async function <T>(
      this: GraphType<T>,
      paths: $ReadOnlyArray<string>,
      options: Options<T>,
    ): Promise<Result<T>> {
      this.dependencies.set(p('/qux'), quxModule);

      return {
        added: new Map(),
        modified: new Map([
          [p('/foo'), fooModule],
          [p('/qux'), quxModule],
        ]),
        deleted: new Set([p('/bar'), p('/baz')]),
      };
    });

    const result = await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });
    expect(result).toEqual({
      added: new Map([]),
      modified: new Map([
        [p('/foo'), fooModule],
        [p('/qux'), quxModule],
      ]),
      deleted: new Set([p('/bar'), p('/baz')]),
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
            {type: 'change', filePath: p('/foo'), metadata: {type: 'f'}},
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
      eventsQueue: [{type: 'add', filePath: p('/foo'), metadata: {type: 'f'}}],
    });

    jest.runAllTimers();

    expect(onChangeFile).toHaveBeenCalled();
  });

  it('should not emit an event when there is a file deleted', async () => {
    const onChangeFile = jest.fn();
    await deltaCalculator.getDelta({reset: false, shallow: false});

    deltaCalculator.on('delete', onChangeFile);

    fileWatcher.emit('change', {
      eventsQueue: [
        {type: 'delete', filePath: p('/foo'), metadata: {type: 'f'}},
      ],
    });

    jest.runAllTimers();

    expect(onChangeFile).not.toHaveBeenCalled();
  });

  it('should retry to build the last delta after getting an error', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [
        {type: 'change', filePath: p('/foo'), metadata: {type: 'f'}},
      ],
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
      eventsQueue: [
        {type: 'change', filePath: p('/foo'), metadata: {type: 'f'}},
      ],
    });

    // Then delete that same file
    fileWatcher.emit('change', {
      eventsQueue: [
        {type: 'delete', filePath: p('/foo'), metadata: {type: 'f'}},
      ],
    });

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map([[p('/bundle'), entryModule]]),
        deleted: new Set([p('/foo')]),
      }),
    );

    expect(
      await deltaCalculator.getDelta({reset: false, shallow: false}),
    ).toEqual({
      added: new Map(),
      modified: new Map([[p('/bundle'), entryModule]]),
      deleted: new Set([p('/foo')]),
      reset: false,
    });

    expect(traverseDependencies).toHaveBeenCalledTimes(1);
    expect(traverseDependencies.mock.calls[0][0]).toEqual([p('/bundle')]);
  });

  it('does not traverse a file after deleting it and one of its dependencies', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    // Delete a file
    fileWatcher.emit('change', {
      eventsQueue: [
        {type: 'delete', filePath: p('/foo'), metadata: {type: 'f'}},
      ],
    });

    // Delete a dependency of the deleted file
    fileWatcher.emit('change', {
      eventsQueue: [
        {type: 'delete', filePath: p('/qux'), metadata: {type: 'f'}},
      ],
    });

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map([[p('/bundle'), entryModule]]),
        deleted: new Set([p('/foo')]),
      }),
    );

    await deltaCalculator.getDelta({reset: false, shallow: false});

    // Only the /bundle module should have been traversed (since it's an
    // inverse dependency of /foo).
    expect(traverseDependencies).toHaveBeenCalledTimes(1);
    expect(traverseDependencies.mock.calls[0][0]).toEqual([p('/bundle')]);
  });

  it('should not do unnecessary work when adding a file after deleting it', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    // First delete a file
    fileWatcher.emit('change', {
      eventsQueue: [
        {type: 'delete', filePath: p('/foo'), metadata: {type: 'f'}},
      ],
    });

    // Then add it again
    fileWatcher.emit('change', {
      eventsQueue: [
        {type: 'change', filePath: p('/foo'), metadata: {type: 'f'}},
      ],
    });

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map([[p('/foo'), entryModule]]),
        deleted: new Set(),
      }),
    );

    await deltaCalculator.getDelta({reset: false, shallow: false});

    expect(traverseDependencies).toHaveBeenCalledTimes(1);
    expect(traverseDependencies.mock.calls[0][0]).toEqual([p('/foo')]);
  });

  it.each(['add', 'delete'])(
    "should re-traverse everything after a symlink '%s'",
    async eventType => {
      await deltaCalculator.getDelta({reset: false, shallow: false});

      const changeEmitted = new Promise(resolve =>
        deltaCalculator.once('change', resolve),
      );

      fileWatcher.emit('change', {
        eventsQueue: [
          {type: eventType, filePath: p('/link'), metadata: {type: 'l'}},
        ],
      });

      // Any symlink change should trigger a 'change' event
      await changeEmitted;

      const traverseResult: Result<{}> = {
        added: new Map(),
        modified: new Map(),
        deleted: new Set(),
      };
      traverseDependencies.mockResolvedValueOnce(traverseResult);

      const result = await deltaCalculator.getDelta({
        reset: false,
        shallow: false,
      });

      // Revisit the whole graph since any resolution could have become invalid.
      expect(traverseDependencies).toHaveBeenCalledWith(
        ['/bundle', '/foo', '/bar', '/baz', '/qux'].map(p),
        expect.objectContaining({shallow: false}),
      );

      expect(result).toEqual({...traverseResult, reset: false});

      // Does not attempt to traverse again on a subsequent delta request.
      traverseDependencies.mockClear();
      await deltaCalculator.getDelta({
        reset: false,
        shallow: false,
      });
      expect(traverseDependencies).not.toHaveBeenCalled();
    },
  );

  test('should re-traverse everything after a package.json change (when unstable_enablePackageExports is true)', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    const changeEmitted = new Promise(resolve =>
      deltaCalculator.once('change', resolve),
    );

    fileWatcher.emit('change', {
      eventsQueue: [
        {
          type: 'change',
          filePath: p('/node_modules/foo/package.json'),
          metadata: {type: 'f'},
        },
      ],
    });

    // Any package.json change should trigger a 'change' event
    await changeEmitted;

    const traverseResult: Result<{}> = {
      added: new Map(),
      modified: new Map(),
      deleted: new Set(),
    };
    traverseDependencies.mockResolvedValueOnce(traverseResult);

    const result = await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    // Revisit the whole graph
    // TODO(T142404809): Replace requiresReset approach with better-scoped
    // invalidation of inverse dependencies
    expect(traverseDependencies).toHaveBeenCalledWith(
      ['/bundle', '/foo', '/bar', '/baz', '/qux'].map(p),
      expect.objectContaining({shallow: false}),
    );

    expect(result).toEqual({...traverseResult, reset: false});

    // Does not attempt to traverse again on a subsequent delta request.
    traverseDependencies.mockClear();
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });
    expect(traverseDependencies).not.toHaveBeenCalled();
  });

  it('should not mutate an existing graph when calling end()', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});
    const graph = deltaCalculator.getGraph();

    const numDependencies = graph.dependencies.size;

    deltaCalculator.end();

    expect(graph.dependencies.size).toEqual(numDependencies);
  });
});
