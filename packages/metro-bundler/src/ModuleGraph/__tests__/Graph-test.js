/**
 * Copyright (c) 2016-present, Facebook, Inc.
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

jest.useRealTimers().mock('console');

const {Console} = require('console');
const Graph = require('../Graph');
const {fn} = require('../test-helpers');

const {any, objectContaining} = jasmine;
const quiet = new Console();

describe('Graph:', () => {
  const anyEntry = ['arbitrary/entry/point'];
  const anyPlatform = 'arbitrary platform';
  const noOpts = undefined;

  let graph, load, resolve;
  beforeEach(() => {
    load = fn();
    resolve = fn();
    resolve.stub.returns('arbitrary file');
    load.stub.returns({
      file: createFileFromId('arbitrary file'),
      dependencies: [],
    });

    graph = Graph.create(resolve, load);
  });

  it('calls back an error when called without any entry point', async () => {
    expect.assertions(1);
    try {
      await graph([], anyPlatform, {log: quiet});
    } catch (error) {
      expect(error).toEqual(any(Error));
    }
  });

  it('resolves the entry point with the passed-in `resolve` function', async () => {
    const entryPoint = '/arbitrary/path';
    await graph([entryPoint], anyPlatform, noOpts);

    expect(resolve).toBeCalledWith(entryPoint, null, any(String), any(Object));
  });

  it('allows to specify multiple entry points', async () => {
    const entryPoints = ['Arbitrary', '../entry.js'];
    await graph(entryPoints, anyPlatform, noOpts);

    expect(resolve).toBeCalledWith(
      entryPoints[0],
      null,
      any(String),
      any(Object),
    );
    expect(resolve).toBeCalledWith(
      entryPoints[1],
      null,
      any(String),
      any(Object),
    );
  });

  it('calls back with an error when called without `platform` option', async () => {
    expect.assertions(1);
    try {
      await graph(anyEntry, undefined, {log: quiet});
    } catch (error) {
      expect(error).toEqual(any(Error));
    }
  });

  it('forwards a passed-in `platform` to `resolve`', async () => {
    const platform = 'any';
    await graph(anyEntry, platform, noOpts);

    expect(resolve).toBeCalledWith(any(String), null, platform, any(Object));
  });

  it('forwards a passed-in `log` option to `resolve`', async () => {
    const log = new Console();
    await graph(anyEntry, anyPlatform, {log});
    expect(resolve).toBeCalledWith(
      any(String),
      null,
      any(String),
      objectContaining({log}),
    );
  });

  it('calls back with every error produced by `resolve`', async () => {
    expect.assertions(1);
    const error = Error();
    resolve.stub.throws(error);

    try {
      await graph(anyEntry, anyPlatform, noOpts);
    } catch (e) {
      expect(e).toBe(error);
    }
  });

  it('passes the files returned by `resolve` on to the `load` function', async () => {
    const modules = new Map([
      ['Arbitrary', '/absolute/path/to/Arbitrary.js'],
      ['../entry.js', '/whereever/is/entry.js'],
    ]);
    for (const [id, file] of modules) {
      resolve.stub.withArgs(id).returns(file);
    }
    const [file1, file2] = modules.values();

    await graph(modules.keys(), anyPlatform, noOpts);
    expect(load).toBeCalledWith(file1, any(Object));
    expect(load).toBeCalledWith(file2, any(Object));
  });

  it('passes the `optimize` flag on to `load`', async () => {
    await graph(anyEntry, anyPlatform, {optimize: true});
    expect(load).toBeCalledWith(
      any(String),
      objectContaining({optimize: true}),
    );
  });

  it('uses `false` as the default for the `optimize` flag', async () => {
    await graph(anyEntry, anyPlatform, noOpts);
    expect(load).toBeCalledWith(
      any(String),
      objectContaining({optimize: false}),
    );
  });

  it('forwards a passed-in `log` to `load`', async () => {
    const log = new Console();
    await graph(anyEntry, anyPlatform, {log});
    expect(load).toBeCalledWith(any(String), objectContaining({log}));
  });

  it('calls back with every error produced by `load`', async () => {
    expect.assertions(1);
    const error = Error();
    load.stub.throws(error);

    try {
      await graph(anyEntry, anyPlatform, noOpts);
    } catch (e) {
      expect(e).toBe(error);
    }
  });

  it('resolves any dependencies provided by `load`', async () => {
    const entryPath = '/path/to/entry.js';
    const id1 = 'required/id';
    const id2 = './relative/import';
    resolve.stub.withArgs('entry').returns(entryPath);
    load.stub.withArgs(entryPath).returns({
      file: {path: entryPath},
      dependencies: [id1, id2],
    });

    await graph(['entry'], anyPlatform, noOpts);
    expect(resolve).toBeCalledWith(id1, entryPath, any(String), any(Object));
    expect(resolve).toBeCalledWith(id2, entryPath, any(String), any(Object));
  });

  it('loads transitive dependencies', async () => {
    const entryPath = '/path/to/entry.js';
    const id1 = 'required/id';
    const id2 = './relative/import';
    const path1 = '/path/to/dep/1';
    const path2 = '/path/to/dep/2';

    resolve.stub
      .withArgs(id1)
      .returns(path1)
      .withArgs(id2)
      .returns(path2)
      .withArgs('entry')
      .returns(entryPath);
    load.stub
      .withArgs(entryPath)
      .returns({file: {path: entryPath}, dependencies: [id1]})
      .withArgs(path1)
      .returns({file: {path: path1}, dependencies: [id2]});

    await graph(['entry'], anyPlatform, noOpts);
    expect(resolve).toBeCalledWith(id2, path1, any(String), any(Object));
    expect(load).toBeCalledWith(path1, any(Object));
    expect(load).toBeCalledWith(path2, any(Object));
  });

  it('calls `load` only once for each file', async () => {
    load.stub.reset();

    resolve.stub.callsFake(idToPath);
    load.stub
      .withArgs(idToPath('a'))
      .returns({file: createFileFromId('a'), dependencies: ['b', 'c']})
      .withArgs(idToPath('b'))
      .returns({file: createFileFromId('b'), dependencies: ['c']})
      .withArgs(idToPath('c'))
      .returns({file: createFileFromId('c'), dependencies: []});

    await graph(['a'], anyPlatform, noOpts);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('works when `load` returns promises', async () => {
    load.stub.callsFake(path =>
      Promise.resolve({
        file: createFileFromPath(path),
        dependencies: [],
      }),
    );
    resolve.stub.callsFake(idToPath);

    const entryPoints = ['a', 'b', 'c', 'd', 'e'];
    const expectedModules = entryPoints.map(x => createModule(x));
    const result = await graph(entryPoints, anyPlatform, noOpts);
    expect(result).toEqual({
      entryModules: expectedModules,
      modules: expectedModules,
    });
  });

  it('resolves modules in depth-first traversal order, regardless of the order of loading', async () => {
    load.stub.reset();
    resolve.stub.reset();

    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    ids.forEach(id => {
      const path = idToPath(id);
      resolve.stub.withArgs(id).returns(path);
      load.stub
        .withArgs(path)
        .returns({file: createFileFromId(id), dependencies: []});
    });
    load.stub
      .withArgs(idToPath('a'))
      .returns({file: createFileFromId('a'), dependencies: ['b', 'e', 'h']});

    // load certain files later
    const b = deferred({file: createFileFromId('b'), dependencies: ['c', 'd']});
    const e = deferred({file: createFileFromId('e'), dependencies: ['f', 'g']});
    load.stub
      .withArgs(idToPath('b'))
      .returns(b.promise)
      .withArgs(idToPath('e'))
      .returns(e.promise)
      .withArgs(idToPath('h')).func = (f, o) => {
      process.nextTick(() => {
        // `e` loads after `h`
        e.resolve();
        // `b` loads after `a`
        process.nextTick(b.resolve);
      });
      return {file: createFileFromId('h'), dependencies: []};
    };

    const result = await graph(['a'], anyPlatform, noOpts);
    expect(result.modules).toEqual([
      createModule('a', ['b', 'e', 'h']),
      createModule('b', ['c', 'd']),
      createModule('c'),
      createModule('d'),
      createModule('e', ['f', 'g']),
      createModule('f'),
      createModule('g'),
      createModule('h'),
    ]);
  });

  it('calls back with the resolved modules of the entry points', async () => {
    load.stub.reset();
    resolve.stub.reset();

    load.stub
      .withArgs(idToPath('a'))
      .returns({file: createFileFromId('a'), dependencies: ['b']});
    load.stub
      .withArgs(idToPath('b'))
      .returns({file: createFileFromId('b'), dependencies: []});
    load.stub
      .withArgs(idToPath('c'))
      .returns({file: createFileFromId('c'), dependencies: ['d']});
    load.stub
      .withArgs(idToPath('d'))
      .returns({file: createFileFromId('d'), dependencies: []});

    'abcd'
      .split('')
      .forEach(id => resolve.stub.withArgs(id).returns(idToPath(id)));

    const result = await graph(['a', 'c'], anyPlatform, noOpts);
    expect(result.entryModules).toEqual([
      createModule('a', ['b']),
      createModule('c', ['d']),
    ]);
  });

  it('resolves modules for all entry points correctly if one is a dependency of another', async () => {
    load.stub.reset();
    resolve.stub.reset();

    load.stub
      .withArgs(idToPath('a'))
      .returns({file: createFileFromId('a'), dependencies: ['b']});
    load.stub
      .withArgs(idToPath('b'))
      .returns({file: createFileFromId('b'), dependencies: []});

    'ab'
      .split('')
      .forEach(id => resolve.stub.withArgs(id).returns(idToPath(id)));

    const result = await graph(['a', 'b'], anyPlatform, noOpts);
    expect(result.entryModules).toEqual([
      createModule('a', ['b']),
      createModule('b', []),
    ]);
  });

  it('does not include dependencies more than once', async () => {
    const ids = ['a', 'b', 'c', 'd'];
    ids.forEach(id => {
      const path = idToPath(id);
      resolve.stub.withArgs(id).returns(path);
      load.stub
        .withArgs(path)
        .returns({file: createFileFromId(id), dependencies: []});
    });
    ['a', 'd'].forEach(id =>
      load.stub
        .withArgs(idToPath(id))
        .returns({file: createFileFromId(id), dependencies: ['b', 'c']}),
    );

    const result = await graph(['a', 'd', 'b'], anyPlatform, noOpts);
    expect(result.modules).toEqual([
      createModule('a', ['b', 'c']),
      createModule('b'),
      createModule('c'),
      createModule('d', ['b', 'c']),
    ]);
  });

  it('handles dependency cycles', async () => {
    resolve.stub
      .withArgs('a')
      .returns(idToPath('a'))
      .withArgs('b')
      .returns(idToPath('b'))
      .withArgs('c')
      .returns(idToPath('c'));
    load.stub
      .withArgs(idToPath('a'))
      .returns({file: createFileFromId('a'), dependencies: ['b']})
      .withArgs(idToPath('b'))
      .returns({file: createFileFromId('b'), dependencies: ['c']})
      .withArgs(idToPath('c'))
      .returns({file: createFileFromId('c'), dependencies: ['a']});

    const result = await graph(['a'], anyPlatform, noOpts);
    expect(result.modules).toEqual([
      createModule('a', ['b']),
      createModule('b', ['c']),
      createModule('c', ['a']),
    ]);
  });

  it('can skip files', async () => {
    ['a', 'b', 'c', 'd', 'e'].forEach(id =>
      resolve.stub.withArgs(id).returns(idToPath(id)),
    );
    load.stub
      .withArgs(idToPath('a'))
      .returns({file: createFileFromId('a'), dependencies: ['b', 'c', 'd']})
      .withArgs(idToPath('b'))
      .returns({file: createFileFromId('b'), dependencies: ['e']});
    ['c', 'd', 'e'].forEach(id =>
      load.stub
        .withArgs(idToPath(id))
        .returns({file: createFileFromId(id), dependencies: []}),
    );
    const skip = new Set([idToPath('b'), idToPath('c')]);

    const result = await graph(['a'], anyPlatform, {skip});
    expect(result.modules).toEqual([
      createModule('a', ['b', 'c', 'd']),
      createModule('d', []),
    ]);
  });
});

function createDependency(id) {
  return {id, path: idToPath(id)};
}

function createFileFromId(id) {
  return createFileFromPath(idToPath(id));
}

function createFileFromPath(path) {
  return {ast: {}, path};
}

function createModule(id, dependencies = []): Module {
  return {
    file: createFileFromId(id),
    dependencies: dependencies.map(createDependency),
  };
}

function idToPath(id) {
  return '/path/to/' + id;
}

function deferred(value) {
  let resolve;
  const promise = new Promise(res => (resolve = res));
  return {promise, resolve: () => resolve(value)};
}
