/**
 * Copyright (c) 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */
'use strict';

jest
  .useRealTimers()
  .mock('console');

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
    load.stub.returns({file: createFile('arbitrary file'), dependencies: []});

    graph = Graph.create(resolve, load);
  });

  it('calls back an error when called without any entry point', done => {
    graph([], anyPlatform, {log: quiet}, error => {
      expect(error).toEqual(any(Error));
      done();
    });
  });

  it('resolves the entry point with the passed-in `resolve` function', done => {
    const entryPoint = '/arbitrary/path';
    graph([entryPoint], anyPlatform, noOpts, () => {
      expect(resolve).toBeCalledWith(
        entryPoint, null, any(String), any(Object));
      done();
    });
  });

  it('allows to specify multiple entry points', done => {
    const entryPoints = ['Arbitrary', '../entry.js'];
    graph(entryPoints, anyPlatform, noOpts, () => {
      expect(resolve).toBeCalledWith(
        entryPoints[0], null, any(String), any(Object));
      expect(resolve).toBeCalledWith(
        entryPoints[1], null, any(String), any(Object));
      done();
    });

  });

  it('calls back with an error when called without `platform` option', done => {
    graph(anyEntry, undefined, {log: quiet}, error => {
      expect(error).toEqual(any(Error));
      done();
    });
  });

  it('forwards a passed-in `platform` to `resolve`', done => {
    const platform = 'any';
    graph(anyEntry, platform, noOpts, () => {
      expect(resolve).toBeCalledWith(
        any(String), null, platform, any(Object));
      done();
    });
  });

  it('forwards a passed-in `log` option to `resolve`', done => {
    const log = new Console();
    graph(anyEntry, anyPlatform, {log}, () => {
      expect(resolve).toBeCalledWith(
        any(String), null, any(String), objectContaining({log}));
      done();
    });
  });

  it('calls back with every error produced by `resolve`', done => {
    const error = Error();
    resolve.stub.throws(error);
    graph(anyEntry, anyPlatform, noOpts, e => {
      expect(e).toBe(error);
      done();
    });
  });

  it('only calls back once if two parallel invocations of `resolve` fail', done => {
    load.stub.returns({
      file: createFile('with two deps'),
      dependencies: ['depA', 'depB']},
    );
    resolve.stub
      .withArgs('depA').throws(new Error())
      .withArgs('depB').throws(new Error());

    let calls = 0;
    function callback() {
      if (calls === 0) {
        process.nextTick(() => {
          expect(calls).toEqual(1);
          done();
        });
      }
      ++calls;
    }

    graph(['entryA', 'entryB'], anyPlatform, noOpts, callback);
  });

  it('passes the files returned by `resolve` on to the `load` function', done => {
    const modules = new Map([
      ['Arbitrary', '/absolute/path/to/Arbitrary.js'],
      ['../entry.js', '/whereever/is/entry.js'],
    ]);
    for (const [id, file] of modules) {
      resolve.stub.withArgs(id).returns(file);
    }
    const [file1, file2] = modules.values();

    graph(modules.keys(), anyPlatform, noOpts, () => {
      expect(load).toBeCalledWith(file1, any(Object));
      expect(load).toBeCalledWith(file2, any(Object));
      done();
    });
  });

  it('passes the `optimize` flag on to `load`', done => {
    graph(anyEntry, anyPlatform, {optimize: true}, () => {
      expect(load).toBeCalledWith(
        any(String), objectContaining({optimize: true}));
      done();
    });
  });

  it('uses `false` as the default for the `optimize` flag', done => {
    graph(anyEntry, anyPlatform, noOpts, () => {
      expect(load).toBeCalledWith(
        any(String), objectContaining({optimize: false}));
      done();
    });
  });

  it('forwards a passed-in `log` to `load`', done => {
    const log = new Console();
    graph(anyEntry, anyPlatform, {log}, () => {
      expect(load)
        .toBeCalledWith(any(String), objectContaining({log}));
      done();
    });
  });

  it('calls back with every error produced by `load`', done => {
    const error = Error();
    load.stub.throws(error);
    graph(anyEntry, anyPlatform, noOpts, e => {
      expect(e).toBe(error);
      done();
    });
  });

  it('resolves any dependencies provided by `load`', done => {
    const entryPath = '/path/to/entry.js';
    const id1 = 'required/id';
    const id2 = './relative/import';
    resolve.stub.withArgs('entry').returns(entryPath);
    load.stub.withArgs(entryPath).returns({
      file: {path: entryPath},
      dependencies: [id1, id2],
    });

    graph(['entry'], anyPlatform, noOpts, () => {
      expect(resolve).toBeCalledWith(
        id1, entryPath, any(String), any(Object));
      expect(resolve).toBeCalledWith(
        id2, entryPath, any(String), any(Object));
      done();
    });
  });

  it('loads transitive dependencies', done => {
    const entryPath = '/path/to/entry.js';
    const id1 = 'required/id';
    const id2 = './relative/import';
    const path1 = '/path/to/dep/1';
    const path2 = '/path/to/dep/2';

    resolve.stub
      .withArgs(id1).returns(path1)
      .withArgs(id2).returns(path2)
      .withArgs('entry').returns(entryPath);
    load.stub
      .withArgs(entryPath).returns({file: {path: entryPath}, dependencies: [id1]})
      .withArgs(path1).returns({file: {path: path1}, dependencies: [id2]});

    graph(['entry'], anyPlatform, noOpts, () => {
      expect(resolve).toBeCalledWith(id2, path1, any(String), any(Object));
      expect(load).toBeCalledWith(path1, any(Object));
      expect(load).toBeCalledWith(path2, any(Object));
      done();
    });
  });

  it('resolves modules in depth-first traversal order, regardless of the order of loading',
    done => {
      load.stub.reset();
      resolve.stub.reset();

      const ids = [
        'a',
        'b',
        'c', 'd',
        'e',
        'f', 'g',
        'h',
      ];
      ids.forEach(id => {
        const path = idToPath(id);
        resolve.stub.withArgs(id).returns(path);
        load.stub.withArgs(path).returns({file: createFile(id), dependencies: []});
      });
      load.stub.withArgs(idToPath('a')).returns({file: createFile('a'), dependencies: ['b', 'e', 'h']});

      // load certain files later
      const b = deferred({file: createFile('b'), dependencies: ['c', 'd']});
      const e = deferred({file: createFile('e'), dependencies: ['f', 'g']});
      load.stub
        .withArgs(idToPath('b')).returns(b.promise)
        .withArgs(idToPath('e')).returns(e.promise)
        .withArgs(idToPath('h')).func = (f, o) => {
          process.nextTick(() => {
            // `e` loads after `h`
            e.resolve();
            // `b` loads after `a`
            process.nextTick(b.resolve);
          });
          return {file: createFile('h'), dependencies: []};
        };

      graph(['a'], anyPlatform, noOpts, (error, result) => {
        expect(error).toEqual(null);
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
        done();
      });
    },
  );

  it('calls back with the resolved modules of the entry points', done => {
    load.stub.reset();
    resolve.stub.reset();

    load.stub.withArgs(idToPath('a')).returns({file: createFile('a'), dependencies: ['b']});
    load.stub.withArgs(idToPath('b')).returns({file: createFile('b'), dependencies: []});
    load.stub.withArgs(idToPath('c')).returns({file: createFile('c'), dependencies: ['d']});
    load.stub.withArgs(idToPath('d')).returns({file: createFile('d'), dependencies: []});

    'abcd'.split('')
      .forEach(id => resolve.stub.withArgs(id).returns(idToPath(id)));

    graph(['a', 'c'], anyPlatform, noOpts, (error, result) => {
      expect(result.entryModules).toEqual([
        createModule('a', ['b']),
        createModule('c', ['d']),
      ]);
      done();
    });
  });

  it('resolves modules for all entry points correctly if one is a dependency of another', done => {
    load.stub.reset();
    resolve.stub.reset();

    load.stub.withArgs(idToPath('a')).returns({file: createFile('a'), dependencies: ['b']});
    load.stub.withArgs(idToPath('b')).returns({file: createFile('b'), dependencies: []});

    'ab'.split('')
      .forEach(id => resolve.stub.withArgs(id).returns(idToPath(id)));

    graph(['a', 'b'], anyPlatform, noOpts, (error, result) => {
      expect(result.entryModules).toEqual([
        createModule('a', ['b']),
        createModule('b', []),
      ]);
      done();
    });
  });

  it('does not include dependencies more than once', done => {
    const ids = ['a', 'b', 'c', 'd'];
    ids.forEach(id => {
      const path = idToPath(id);
      resolve.stub.withArgs(id).returns(path);
      load.stub.withArgs(path).returns({file: createFile(id), dependencies: []});
    });
    ['a', 'd'].forEach(id =>
      load.stub
        .withArgs(idToPath(id)).returns({file: createFile(id), dependencies: ['b', 'c']}));

    graph(['a', 'd', 'b'], anyPlatform, noOpts, (error, result) => {
      expect(error).toEqual(null);
      expect(result.modules).toEqual([
        createModule('a', ['b', 'c']),
        createModule('b'),
        createModule('c'),
        createModule('d', ['b', 'c']),
      ]);
      done();
    });
  });

  it('handles dependency cycles', done => {
    resolve.stub
      .withArgs('a').returns(idToPath('a'))
      .withArgs('b').returns(idToPath('b'))
      .withArgs('c').returns(idToPath('c'));
    load.stub
      .withArgs(idToPath('a')).returns({file: createFile('a'), dependencies: ['b']})
      .withArgs(idToPath('b')).returns({file: createFile('b'), dependencies: ['c']})
      .withArgs(idToPath('c')).returns({file: createFile('c'), dependencies: ['a']});

    graph(['a'], anyPlatform, noOpts, (error, result) => {
      expect(result.modules).toEqual([
        createModule('a', ['b']),
        createModule('b', ['c']),
        createModule('c', ['a']),
      ]);
      done();
    });
  });

  it('can skip files', done => {
    ['a', 'b', 'c', 'd', 'e'].forEach(
      id => resolve.stub.withArgs(id).returns(idToPath(id)));
    load.stub
      .withArgs(idToPath('a')).returns({file: createFile('a'), dependencies: ['b', 'c', 'd']})
      .withArgs(idToPath('b')).returns({file: createFile('b'), dependencies: ['e']});
    ['c', 'd', 'e'].forEach(id =>
      load.stub.withArgs(idToPath(id)).returns({file: createFile(id), dependencies: []}));
    const skip = new Set([idToPath('b'), idToPath('c')]);

    graph(['a'], anyPlatform, {skip}, (error, result) => {
      expect(result.modules).toEqual([
        createModule('a', ['b', 'c', 'd']),
        createModule('d', []),
      ]);
      done();
    });
  });
});

function createDependency(id) {
  return {id, path: idToPath(id)};
}

function createFile(id) {
  return {ast: {}, path: idToPath(id)};
}

function createModule(id, dependencies = []): Module {
  return {
    file: createFile(id),
    dependencies: dependencies.map(createDependency),
  };
}

function idToPath(id) {
  return '/path/to/' + id;
}

function deferred(value) {
  let resolve;
  const promise = new Promise(res => resolve = res);
  return {promise, resolve: () => resolve(value)};
}
