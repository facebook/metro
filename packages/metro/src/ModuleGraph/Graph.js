/**
 * Copyright (c) 2016-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */
'use strict';

const invariant = require('fbjs/lib/invariant');
const emptyModule = require('./module').empty;
const nullthrows = require('fbjs/lib/nullthrows');

import type {
  GraphFn,
  LoadFn,
  LoadResult,
  Module,
  ResolveFn,
  TransformResultDependency,
} from './types.flow';

const NO_OPTIONS = {};

exports.create = function create(resolve: ResolveFn, load: LoadFn): GraphFn {
  return async function Graph(entryPoints, platform, options) {
    const {log = (console: any), optimize = false, skip} =
      options || NO_OPTIONS;

    if (typeof platform !== 'string') {
      log.error('`Graph`, called without a platform');
      return Promise.reject(new Error('The target platform has to be passed'));
    }

    const loadOptions = {log, optimize};
    const memoizingLoad = memoizeLoad(load);

    const queue: Queue<
      {
        dependency: TransformResultDependency,
        parent: ?string,
        parentDependencyIndex: number,
        skip: ?Set<string>,
      },
      LoadResult,
      Map<?string, Module>,
    > = new Queue(
      ({dependency, parent}) =>
        memoizingLoad(
          resolve(dependency.name, parent, platform, options || NO_OPTIONS),
          loadOptions,
        ),
      onFileLoaded,
      new Map([[null, emptyModule()]]),
    );

    const tasks = Array.from(entryPoints, (id, i) => ({
      dependency: {name: id, data: {isAsync: false}},
      parent: null,
      parentDependencyIndex: i,
      skip,
    }));

    queue.enqueue(...tasks);
    return collect(await queue.result);
  };
};

class Queue<T, R, A> {
  _accumulate: (Queue<T, R, A>, A, R, T) => A;
  _pending: Set<T> = new Set();
  _queue: Array<T> = [];
  _reject: Error => void;
  _resolve: A => void;
  _result: A;
  _runTask: T => R | Promise<R>;
  _running: boolean;
  result: Promise<A>;

  constructor(
    runTask: T => R | Promise<R>,
    accumulate: (Queue<T, R, A>, A, R, T) => A,
    initial: A,
  ) {
    this._runTask = runTask;
    this._accumulate = accumulate;
    this._result = initial;

    const {promise, reject, resolve} = deferred();
    this.result = promise;
    this._reject = reject;
    this._resolve = resolve;
  }

  enqueue(...tasks: Array<T>) {
    this._queue.push(...tasks);
    this._run();
  }

  _onAsyncTaskDone(result: R, task: T) {
    this._pending.delete(task);
    this._onTaskDone(result, task);
    this._run();
  }

  _onTaskDone(result: R, task: T) {
    this._result = this._accumulate(this, this._result, result, task);
  }

  _run() {
    if (this._running) {
      return;
    }

    this._running = true;

    const queue = this._queue;
    const runTask = this._runTask;
    while (queue.length) {
      const task = queue.shift();
      const result = runTask(task);
      if (isPromise(result)) {
        this._pending.add(task);
        result.then(
          result => this._onAsyncTaskDone(result, task),
          this._reject,
        );
      } else {
        this._onTaskDone(result, task);
      }
    }

    this._running = false;
    if (this._pending.size === 0) {
      this._resolve(this._result);
    }
  }
}

function onFileLoaded(
  queue,
  modules,
  {file, dependencies},
  {dependency, parent, parentDependencyIndex, skip},
) {
  const {path} = file;
  const parentModule = modules.get(parent);

  invariant(parentModule, 'Invalid parent module: ' + String(parent));
  parentModule.dependencies[parentDependencyIndex] = {
    id: dependency.name,
    isAsync: dependency.data.isAsync,
    path,
  };

  if ((!skip || !skip.has(path)) && !modules.has(path)) {
    modules.set(path, {file, dependencies: Array(dependencies.length)});
    queue.enqueue(
      ...dependencies.map((dependency, i) => ({
        dependency,
        parent: path,
        parentDependencyIndex: i,
        skip,
      })),
    );
  }

  return modules;
}

function collect(
  modules,
  path = null,
  serialized = {entryModules: [], modules: []},
  seen = new Set(),
) {
  const module = modules.get(path);
  if (module == null || seen.has(path)) {
    return serialized;
  }

  const {dependencies} = module;
  if (path === null) {
    serialized.entryModules = dependencies.map(dep =>
      nullthrows(modules.get(dep.path)),
    );
  } else {
    serialized.modules.push(module);
    seen.add(path);
  }

  for (const dependency of dependencies) {
    collect(modules, dependency.path, serialized, seen);
  }

  return serialized;
}

declare function isPromise(x: mixed): boolean %checks(x instanceof Promise);

function memoizeLoad(load: LoadFn): LoadFn {
  const cache = new Map();
  return (path, options) => {
    const cached = cache.get(path);
    if (cached !== undefined) {
      return cached;
    }

    const result = load(path, options);
    cache.set(path, result);
    if (isPromise(result)) {
      result.then(resolved => cache.set(path, resolved));
    }

    return result;
  };
}

// eslint-disable-next-line lint/no-unclear-flowtypes, no-redeclare
function isPromise(x: {then?: ?Function}) {
  return x != null && typeof x.then === 'function';
}

function deferred<T>(): {
  promise: Promise<T>,
  reject: Error => void,
  resolve: T => void,
} {
  let reject, resolve;
  const promise = new Promise((res, rej) => {
    reject = rej;
    resolve = res;
  });

  return {promise, reject: nullthrows(reject), resolve: nullthrows(resolve)};
}
