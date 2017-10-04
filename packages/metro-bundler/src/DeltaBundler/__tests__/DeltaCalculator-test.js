/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

jest.mock('../../Bundler');
jest.mock('../../Resolver');
jest.mock('../traverseDependencies');

const Bundler = require('../../Bundler');
const {EventEmitter} = require('events');

const DeltaCalculator = require('../DeltaCalculator');
const {
  initialTraverseDependencies,
  traverseDependencies,
} = require('../traverseDependencies');

describe('DeltaCalculator', () => {
  const entryModule = createModule({path: '/bundle', name: 'bundle'});
  const moduleFoo = createModule({path: '/foo', name: 'foo'});
  const moduleBar = createModule({path: '/bar', name: 'bar'});
  const moduleBaz = createModule({path: '/baz', name: 'baz'});

  let deltaCalculator;
  let fileWatcher;
  let mockedDependencies;

  const bundlerMock = new Bundler();

  const options = {
    assetPlugins: [],
    dev: true,
    entryFile: 'bundle',
    entryModuleOnly: false,
    excludeSource: false,
    generateSourceMaps: false,
    hot: true,
    inlineSourceMap: true,
    isolateModuleIDs: false,
    minify: false,
    platform: 'ios',
    runBeforeMainModule: ['core'],
    runModule: true,
    sourceMapUrl: undefined,
    unbundle: false,
  };

  function createModule({path, name, isAsset, isJSON}) {
    return {
      path,
      name,
      getName() {
        return name;
      },
      isAsset() {
        return !!isAsset;
      },
      isJSON() {
        return !!isAsset;
      },
    };
  }

  beforeEach(async () => {
    mockedDependencies = [entryModule, moduleFoo, moduleBar, moduleBaz];

    fileWatcher = new EventEmitter();

    const dependencyGraph = {
      getWatcher() {
        return fileWatcher;
      },
      getAbsolutePath(path) {
        return '/' + path;
      },
      getModuleForPath(path) {
        return mockedDependencies.filter(dep => dep.path === path)[0];
      },
    };

    initialTraverseDependencies.mockImplementationOnce(
      async (path, dg, opt, edges) => {
        edges.set('/bundle', entryModule);
        edges.set('/foo', {...moduleFoo, inverseDependencies: ['/bundle']});
        edges.set('/bar', {...moduleBar, inverseDependencies: ['/bundle']});
        edges.set('/baz', {...moduleBaz, inverseDependencies: ['/bundle']});

        return {
          added: new Set(['/bundle', '/foo', '/bar', '/baz']),
          deleted: new Set(),
        };
      },
    );

    Bundler.prototype.getTransformOptions.mockImplementation(async () => {
      return {
        transformer: {},
      };
    });

    deltaCalculator = new DeltaCalculator(
      bundlerMock,
      dependencyGraph,
      options,
    );
  });

  afterEach(() => {
    initialTraverseDependencies.mockReset();
    traverseDependencies.mockReset();
  });

  it('should start listening for file changes after being initialized', async () => {
    expect(fileWatcher.listeners('change')).toHaveLength(1);
  });

  it('should stop listening for file changes after being destroyed', () => {
    deltaCalculator.end();

    expect(fileWatcher.listeners('change')).toHaveLength(0);
  });

  it('should include the entry file when calculating the initial bundle', async () => {
    const result = await deltaCalculator.getDelta();

    expect(result).toEqual({
      modified: new Map([
        ['/bundle', entryModule],
        ['/foo', moduleFoo],
        ['/bar', moduleBar],
        ['/baz', moduleBaz],
      ]),
      deleted: new Set(),
      reset: true,
    });
  });

  it('should return an empty delta when there are no changes', async () => {
    await deltaCalculator.getDelta();

    expect(await deltaCalculator.getDelta()).toEqual({
      modified: new Map(),
      deleted: new Set(),
      reset: false,
    });

    expect(traverseDependencies.mock.calls.length).toBe(0);
  });

  it('should calculate a delta after a simple modification', async () => {
    await deltaCalculator.getDelta();

    fileWatcher.emit('change', {eventsQueue: [{filePath: '/foo'}]});

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Set(),
        deleted: new Set(),
      }),
    );

    const result = await deltaCalculator.getDelta();

    expect(result).toEqual({
      modified: new Map([['/foo', moduleFoo]]),
      deleted: new Set(),
      reset: false,
    });

    expect(traverseDependencies.mock.calls.length).toBe(1);
  });

  it('should calculate a delta after removing a dependency', async () => {
    // Get initial delta
    await deltaCalculator.getDelta();

    fileWatcher.emit('change', {eventsQueue: [{filePath: '/foo'}]});

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Set(),
        deleted: new Set(['/baz']),
      }),
    );

    const result = await deltaCalculator.getDelta();

    expect(result).toEqual({
      modified: new Map([['/foo', moduleFoo]]),
      deleted: new Set(['/baz']),
      reset: false,
    });

    expect(traverseDependencies.mock.calls.length).toBe(1);
  });

  it('should calculate a delta after adding/removing dependencies', async () => {
    // Get initial delta
    await deltaCalculator.getDelta();

    fileWatcher.emit('change', {eventsQueue: [{filePath: '/foo'}]});

    const moduleQux = createModule({path: '/qux', name: 'qux'});

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Set([moduleQux.path]),
        deleted: new Set(['/bar', '/baz']),
      }),
    );

    const result = await deltaCalculator.getDelta();
    expect(result).toEqual({
      modified: new Map([['/foo', moduleFoo], ['/qux', moduleQux]]),
      deleted: new Set(['/bar', '/baz']),
      reset: false,
    });
  });

  it('should emit an event when there is a relevant file change', async done => {
    await deltaCalculator.getDelta();

    deltaCalculator.on('change', () => done());

    fileWatcher.emit('change', {eventsQueue: [{filePath: '/foo'}]});
  });

  it('should not emit an event when there is a file deleted', async () => {
    jest.useFakeTimers();

    const onChangeFile = jest.fn();
    await deltaCalculator.getDelta();

    deltaCalculator.on('delete', onChangeFile);

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/foo'}],
    });

    jest.runAllTimers();

    expect(onChangeFile).not.toHaveBeenCalled();
  });

  it('should retry to build the last delta after getting an error', async () => {
    await deltaCalculator.getDelta();

    fileWatcher.emit('change', {eventsQueue: [{filePath: '/foo'}]});

    traverseDependencies.mockReturnValue(Promise.reject(new Error()));

    await expect(deltaCalculator.getDelta()).rejects.toBeInstanceOf(Error);

    // This second time it should still throw an error.
    await expect(deltaCalculator.getDelta()).rejects.toBeInstanceOf(Error);
  });

  it('should never try to traverse a file after deleting it', async () => {
    await deltaCalculator.getDelta();

    // First modify the file
    fileWatcher.emit('change', {eventsQueue: [{filePath: '/foo'}]});

    // Then delete that same file
    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/foo'}],
    });

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Set(),
        deleted: new Set(['/foo']),
      }),
    );

    expect(await deltaCalculator.getDelta()).toEqual({
      modified: new Map([['/bundle', entryModule]]),
      deleted: new Set(['/foo']),
      reset: false,
    });

    expect(traverseDependencies.mock.calls[0][0]).toEqual(['/bundle']);
  });
});
