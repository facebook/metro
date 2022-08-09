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
const markModifiedContextModules = jest.fn();
jest.doMock('../graphOperations', () => ({
  ...jest.requireActual('../graphOperations'),
  initialTraverseDependencies,
  traverseDependencies,
  reorderGraph,
  markModifiedContextModules,
}));

const DeltaCalculator = require('../DeltaCalculator');
const {EventEmitter} = require('events');

describe('DeltaCalculator', () => {
  let entryModule;
  let fooModule;
  let ctxModule;

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

    markModifiedContextModules.mockReset();
    // ~/
    // ├─ bundle
    // ├─ ctx/
    // │  ├─ foo

    initialTraverseDependencies.mockImplementationOnce(async (graph, opt) => {
      //
      // require.context('./ctx')
      //
      entryModule = {
        dependencies: new Map([['ctx', '/ctx?ctx=xxx']]),
        inverseDependencies: [],
        output: {
          name: 'bundle',
        },
        path: '/bundle',
      };

      // Virtual context module.
      ctxModule = {
        dependencies: new Map([['foo', '/ctx/foo']]),
        inverseDependencies: ['/bundle'],
        output: {
          name: 'ctx',
        },
        path: '/ctx?ctx=xxx',
      };

      fooModule = {
        dependencies: new Map(),
        inverseDependencies: ['/ctx?ctx=xxx'],
        output: {
          name: 'foo',
        },
        path: '/ctx/foo',
      };

      graph.dependencies.set('/bundle', entryModule);
      graph.dependencies.set('/ctx?ctx=xxx', ctxModule);
      graph.dependencies.set('/foo', fooModule);

      return {
        added: new Map([
          ['/bundle', entryModule],
          ['/ctx?ctx=xxx', entryModule],
          ['/ctx/foo', fooModule],
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

  it('should include the entry file when calculating the initial bundle', async () => {
    const result = await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(result).toEqual({
      added: new Map([
        ['/bundle', entryModule],
        [
          '/ctx?ctx=xxx',
          {
            dependencies: new Map([['ctx', '/ctx?ctx=xxx']]),
            inverseDependencies: [],
            output: {
              name: 'bundle',
            },
            path: '/bundle',
          },
        ],
        ['/ctx/foo', fooModule],
      ]),
      modified: new Map(),
      deleted: new Set(),
      reset: true,
    });

    jest.runAllTicks();
  });

  it('should calculate a delta after removing a dependency', async () => {
    // Get initial delta
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/foo'}],
    });

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map([['/ctx?ctx=xxx', ctxModule]]),
        deleted: new Set(['/foo']),
      }),
    );

    const result = await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).toBeCalledWith(
      ['/ctx?ctx=xxx'],
      expect.anything(),
      expect.anything(),
    );

    expect(result).toEqual({
      added: new Map(),
      modified: new Map([['/ctx?ctx=xxx', expect.anything()]]),
      deleted: new Set(['/foo']),
      reset: false,
    });

    // We rely on inverse dependencies to update a context module.
    expect(markModifiedContextModules).not.toBeCalled();

    expect(traverseDependencies.mock.calls.length).toBe(1);
  });

  it('should calculate a delta after adding/removing dependencies', async () => {
    // Emulate matching the deleted file against the first context module
    markModifiedContextModules.mockImplementationOnce(
      (graph, filePath, modifiedDependencies) => {
        modifiedDependencies.add('/ctx?ctx=xxx');
      },
    );

    // Get initial delta: (_addedFiles, _deletedFiles, _modifiedFiles) -> _getChangedDependencies -> traverseDependencies
    await deltaCalculator.getDelta({reset: false, shallow: false});

    // _handleMultipleFileChanges -> _handleFileChange -> (_addedFiles, _deletedFiles, _modifiedFiles)
    fileWatcher.emit('change', {
      eventsQueue: [{type: 'add', filePath: '/qux'}],
    });

    const quxModule = {
      dependencies: new Map(),
      inverseDependencies: [],
      output: {name: 'qux'},
      path: '/qux',
    };

    traverseDependencies.mockImplementation(async (path, graph, options) => {
      graph.dependencies.set('/qux', quxModule);
      return {
        added: new Map([['/qux', quxModule]]),
        modified: new Map([['/ctx?ctx=xxx', ctxModule]]),
        deleted: new Set([]),
      };
    });

    const result = await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    // Test if the new module matches any of the context modules.
    expect(markModifiedContextModules).toBeCalledWith(
      expect.anything(),
      '/qux',
      new Set(['/ctx?ctx=xxx']),
    );

    // Called with context module
    expect(traverseDependencies).toBeCalledWith(
      ['/ctx?ctx=xxx'],
      expect.anything(),
      expect.anything(),
    );

    expect(result).toEqual({
      added: new Map([['/qux', quxModule]]),
      modified: new Map([['/ctx?ctx=xxx', ctxModule]]),
      deleted: new Set(),
      reset: false,
    });
  });

  it('should retry to build the last delta after getting an error', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {eventsQueue: [{filePath: '/ctx?ctx=xxx'}]});

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
    fileWatcher.emit('change', {eventsQueue: [{filePath: '/ctx?ctx=xxx'}]});

    // Then delete that same file
    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/ctx?ctx=xxx'}],
    });

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map([['/bundle', entryModule]]),
        deleted: new Set(['/ctx?ctx=xxx']),
      }),
    );

    expect(
      await deltaCalculator.getDelta({reset: false, shallow: false}),
    ).toEqual({
      added: new Map(),
      modified: new Map([['/bundle', entryModule]]),
      deleted: new Set(['/ctx?ctx=xxx']),
      reset: false,
    });

    expect(traverseDependencies).toHaveBeenCalledTimes(1);
    expect(traverseDependencies.mock.calls[0][0]).toEqual(['/bundle']);
  });

  it('does not traverse a file after deleting it and one of its dependencies', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    // Delete a file
    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/ctx?ctx=xxx'}],
    });

    // Delete a dependency of the deleted file
    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/foo'}],
    });

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map([['/bundle', entryModule]]),
        deleted: new Set(['/ctx?ctx=xxx']),
      }),
    );

    await deltaCalculator.getDelta({reset: false, shallow: false});

    // Only the /bundle module should have been traversed (since it's an
    // inverse dependency of /ctx?ctx=xxx).
    expect(traverseDependencies).toHaveBeenCalledTimes(1);
    expect(traverseDependencies.mock.calls[0][0]).toEqual(['/bundle']);
  });

  it('should not do unnecessary work when adding a context module file after deleting it', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    // First delete a file
    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/ctx?ctx=xxx'}],
    });

    // Then add it again
    fileWatcher.emit('change', {eventsQueue: [{filePath: '/ctx?ctx=xxx'}]});

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map([['/ctx?ctx=xxx', entryModule]]),
        deleted: new Set(),
      }),
    );

    await deltaCalculator.getDelta({reset: false, shallow: false});

    expect(traverseDependencies).toHaveBeenCalledTimes(1);
    expect(traverseDependencies.mock.calls[0][0]).toEqual(['/ctx?ctx=xxx']);
  });
});
