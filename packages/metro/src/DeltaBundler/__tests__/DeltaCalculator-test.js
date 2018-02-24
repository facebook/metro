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

jest.mock('../../Bundler');
jest.mock('../traverseDependencies');

const {
  initialTraverseDependencies,
  reorderDependencies,
  traverseDependencies,
} = require('../traverseDependencies');

const Bundler = require('../../Bundler');
const {EventEmitter} = require('events');

const DeltaCalculator = require('../DeltaCalculator');
const getTransformOptions = require('../../__fixtures__/getTransformOptions');

describe('DeltaCalculator', () => {
  const entryModule = createModule({path: '/bundle', name: 'bundle'});
  const moduleFoo = createModule({path: '/foo', name: 'foo'});
  const moduleBar = createModule({path: '/bar', name: 'bar'});
  const moduleBaz = createModule({path: '/baz', name: 'baz'});

  let edgeModule;
  let edgeFoo;
  let edgeBar;
  let edgeBaz;

  let deltaCalculator;
  let fileWatcher;
  let mockedDependencies;
  let bundlerMock;

  const options = {
    assetPlugins: [],
    dev: true,
    entryFile: 'bundle',
    entryModuleOnly: false,
    excludeSource: false,
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
    };
  }

  beforeEach(async () => {
    bundlerMock = new Bundler();

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
        edgeModule = {
          ...entryModule,
          dependencies: new Map([
            ['foo', '/foo'],
            ['bar', '/bar'],
            ['baz', '/baz'],
          ]),
        };
        edgeFoo = {
          ...moduleFoo,
          dependencies: new Map(),
          inverseDependencies: ['/bundle'],
        };
        edgeBar = {
          ...moduleBar,
          dependencies: new Map(),
          inverseDependencies: ['/bundle'],
        };
        edgeBaz = {
          ...moduleBaz,
          dependencies: new Map(),
          inverseDependencies: ['/bundle'],
        };

        edges.set('/bundle', edgeModule);
        edges.set('/foo', edgeFoo);
        edges.set('/bar', edgeBar);
        edges.set('/baz', edgeBaz);

        return {
          added: new Map([
            ['/bundle', edgeModule],
            ['/foo', edgeFoo],
            ['/bar', edgeBar],
            ['/baz', edgeBaz],
          ]),
          deleted: new Set(),
        };
      },
    );

    Bundler.prototype.getGlobalTransformOptions.mockReturnValue({
      enableBabelRCLookup: false,
      projectRoot: '/foo',
    });

    Bundler.prototype.getTransformOptionsForEntryFile.mockReturnValue(
      Promise.resolve({
        inlineRequires: false,
      }),
    );

    deltaCalculator = new DeltaCalculator(
      bundlerMock,
      dependencyGraph,
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
    const result = await deltaCalculator.getDelta({reset: false});

    expect(result).toEqual({
      modified: new Map([
        ['/bundle', edgeModule],
        ['/foo', edgeFoo],
        ['/bar', edgeBar],
        ['/baz', edgeBaz],
      ]),
      deleted: new Set(),
      reset: true,
    });

    jest.runAllTicks();
  });

  it('should return an empty delta when there are no changes', async () => {
    await deltaCalculator.getDelta({reset: false});

    expect(await deltaCalculator.getDelta({reset: false})).toEqual({
      modified: new Map(),
      deleted: new Set(),
      reset: false,
    });

    expect(traverseDependencies.mock.calls.length).toBe(0);
  });

  it('should return a full delta when passing reset=true', async () => {
    reorderDependencies.mockImplementation((_, edges) => edges);

    await deltaCalculator.getDelta({reset: false});

    const result = await deltaCalculator.getDelta({reset: true});

    expect(result).toEqual({
      modified: new Map([
        ['/bundle', edgeModule],
        ['/foo', edgeFoo],
        ['/bar', edgeBar],
        ['/baz', edgeBaz],
      ]),
      deleted: new Set(),
      reset: true,
    });
  });

  it('should calculate a delta after a simple modification', async () => {
    await deltaCalculator.getDelta({reset: false});

    fileWatcher.emit('change', {eventsQueue: [{filePath: '/foo'}]});

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map([['/foo', edgeFoo]]),
        deleted: new Set(),
      }),
    );

    const result = await deltaCalculator.getDelta({reset: false});

    expect(result).toEqual({
      modified: new Map([['/foo', edgeFoo]]),
      deleted: new Set(),
      reset: false,
    });

    expect(traverseDependencies.mock.calls.length).toBe(1);
  });

  it('should calculate a delta after removing a dependency', async () => {
    // Get initial delta
    await deltaCalculator.getDelta({reset: false});

    fileWatcher.emit('change', {eventsQueue: [{filePath: '/foo'}]});

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map([['/foo', edgeFoo]]),
        deleted: new Set(['/baz']),
      }),
    );

    const result = await deltaCalculator.getDelta({reset: false});

    expect(result).toEqual({
      modified: new Map([['/foo', edgeFoo]]),
      deleted: new Set(['/baz']),
      reset: false,
    });

    expect(traverseDependencies.mock.calls.length).toBe(1);
  });

  it('should calculate a delta after adding/removing dependencies', async () => {
    // Get initial delta
    await deltaCalculator.getDelta({reset: false});

    fileWatcher.emit('change', {eventsQueue: [{filePath: '/foo'}]});

    const moduleQux = createModule({path: '/qux', name: 'qux'});
    const edgeQux = {...moduleQux, inverseDependencies: []};

    mockedDependencies.push(moduleQux);

    traverseDependencies.mockImplementation(async (path, dg, opt, edges) => {
      edges.set('/qux', edgeQux);

      return {
        added: new Map([['/foo', edgeFoo], ['/qux', edgeQux]]),
        deleted: new Set(['/bar', '/baz']),
      };
    });

    const result = await deltaCalculator.getDelta({reset: false});
    expect(result).toEqual({
      modified: new Map([['/foo', edgeFoo], ['/qux', edgeQux]]),
      deleted: new Set(['/bar', '/baz']),
      reset: false,
    });
  });

  it('should emit an event when there is a relevant file change', async done => {
    await deltaCalculator.getDelta({reset: false});

    deltaCalculator.on('change', () => done());

    fileWatcher.emit('change', {eventsQueue: [{filePath: '/foo'}]});
  });

  it('should not emit an event when there is a file deleted', async () => {
    jest.useFakeTimers();

    const onChangeFile = jest.fn();
    await deltaCalculator.getDelta({reset: false});

    deltaCalculator.on('delete', onChangeFile);

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/foo'}],
    });

    jest.runAllTimers();

    expect(onChangeFile).not.toHaveBeenCalled();
  });

  it('should retry to build the last delta after getting an error', async () => {
    await deltaCalculator.getDelta({reset: false});

    fileWatcher.emit('change', {eventsQueue: [{filePath: '/foo'}]});

    traverseDependencies.mockReturnValue(Promise.reject(new Error()));

    await expect(
      deltaCalculator.getDelta({reset: false}),
    ).rejects.toBeInstanceOf(Error);

    // This second time it should still throw an error.
    await expect(
      deltaCalculator.getDelta({reset: false}),
    ).rejects.toBeInstanceOf(Error);
  });

  it('should never try to traverse a file after deleting it', async () => {
    await deltaCalculator.getDelta({reset: false});

    // First modify the file
    fileWatcher.emit('change', {eventsQueue: [{filePath: '/foo'}]});

    // Then delete that same file
    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/foo'}],
    });

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map([['/bundle', edgeModule]]),
        deleted: new Set(['/foo']),
      }),
    );

    expect(await deltaCalculator.getDelta({reset: false})).toEqual({
      modified: new Map([['/bundle', edgeModule]]),
      deleted: new Set(['/foo']),
      reset: false,
    });

    expect(traverseDependencies).toHaveBeenCalledTimes(1);
    expect(traverseDependencies.mock.calls[0][0]).toEqual(['/bundle']);
  });

  it('should not do unnecessary work when adding a file after deleting it', async () => {
    await deltaCalculator.getDelta({reset: false});

    // First delete a file
    fileWatcher.emit('change', {
      eventsQueue: [{type: 'delete', filePath: '/foo'}],
    });

    // Then add it again
    fileWatcher.emit('change', {eventsQueue: [{filePath: '/foo'}]});

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map([['/foo', edgeModule]]),
        deleted: new Set(),
      }),
    );

    await deltaCalculator.getDelta({reset: false});

    expect(traverseDependencies).toHaveBeenCalledTimes(1);
    expect(traverseDependencies.mock.calls[0][0]).toEqual(['/foo']);
  });

  describe('getTransformerOptions()', () => {
    it('should calculate the transform options correctly', async () => {
      expect(await deltaCalculator.getTransformerOptions()).toEqual({
        assetDataPlugins: [],
        dev: true,
        enableBabelRCLookup: false,
        hot: true,
        inlineRequires: false,
        minify: false,
        platform: 'ios',
        projectRoot: '/foo',
      });
    });

    it('should return the same params as the standard options', async () => {
      const options = await deltaCalculator.getTransformerOptions();

      expect(Object.keys(options).sort()).toEqual(
        Object.keys(await getTransformOptions()).sort(),
      );
    });

    it('should handle inlineRequires=true correctly', async () => {
      Bundler.prototype.getTransformOptionsForEntryFile.mockReturnValue(
        Promise.resolve({
          inlineRequires: true,
        }),
      );

      expect(await deltaCalculator.getTransformerOptions()).toEqual({
        assetDataPlugins: [],
        dev: true,
        enableBabelRCLookup: false,
        hot: true,
        inlineRequires: true,
        minify: false,
        platform: 'ios',
        projectRoot: '/foo',
      });
    });

    it('should handle an inline requires blacklist correctly', async () => {
      Bundler.prototype.getTransformOptionsForEntryFile.mockReturnValue(
        Promise.resolve({
          inlineRequires: {blacklist: {'/bar': true, '/baz': true}},
        }),
      );

      expect(await deltaCalculator.getTransformerOptions()).toEqual({
        assetDataPlugins: [],
        dev: true,
        enableBabelRCLookup: false,
        hot: true,
        inlineRequires: {blacklist: {'/bar': true, '/baz': true}},
        minify: false,
        platform: 'ios',
        projectRoot: '/foo',
      });
    });
  });
});
