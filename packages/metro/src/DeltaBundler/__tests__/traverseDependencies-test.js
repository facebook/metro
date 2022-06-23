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

import type {
  TransformInputOptions,
  TransformFn,
  Module,
  MixedOutput,
  Dependency,
  Dependencies,
} from '../types.flow';
import type {PrivateState} from '../graphOperations';
import type {Graph, TransformResultDependency} from '../types.flow';

import CountingSet from '../../lib/CountingSet';
import nullthrows from 'nullthrows';

const {
  createGraph,
  initialTraverseDependencies,
  reorderGraph,
  traverseDependencies: traverseDependenciesImpl,
} = require('../graphOperations');

type DependencyDataInput = $Shape<TransformResultDependency['data']>;

let mockedDependencies: Set<string> = new Set();
let mockedDependencyTree: Map<
  string,
  Array<
    $ReadOnly<{
      name: string,
      path: string,
      data?: DependencyDataInput,
    }>,
  >,
> = new Map();
const files = new Set();
let graph: {
  // For convenience, we mutate the graph sometimes
  ...Graph<>,
};
let options;

let entryModule;
let moduleFoo;
let moduleBar;
let moduleBaz;

let mockTransform;

const Actions = {
  modifyFile(path: string) {
    if (mockedDependencies.has(path)) {
      files.add(path);
    }
  },

  moveFile(from: string, to: string) {
    Actions.createFile(to);
    Actions.deleteFile(from);
  },

  deleteFile(path: string) {
    mockedDependencies.delete(path);
  },

  createFile(path: string) {
    mockedDependencies.add(path);
    mockedDependencyTree.set(path, []);

    return path;
  },

  addDependency(
    path: string,
    dependencyPath: string,
    position?: ?number,
    name?: string,
    data?: DependencyDataInput,
  ) {
    const deps = nullthrows(mockedDependencyTree.get(path));
    const dep = {
      name: name ?? dependencyPath.replace('/', ''),
      path: dependencyPath,
      data: data ?? {},
    };
    if (position == null) {
      deps.push(dep);
    } else {
      deps.splice(position, 0, dep);
    }

    mockedDependencyTree.set(path, deps);
    mockedDependencies.add(dependencyPath);

    files.add(path);
  },

  removeDependency(path: string, dependencyPath: string) {
    const deps = nullthrows(mockedDependencyTree.get(path));

    const index = deps.findIndex(({path}) => path === dependencyPath);
    if (index !== -1) {
      deps.splice(index, 1);
      mockedDependencyTree.set(path, deps);
    }

    files.add(path);
  },
};

function deferred(value: {
  +dependencies: $ReadOnlyArray<TransformResultDependency>,
  +getSource: () => Buffer,
  +output: $ReadOnlyArray<MixedOutput>,
}) {
  let resolve;
  const promise = new Promise(res => (resolve = res));

  return {promise, resolve: () => resolve(value)};
}

/* $FlowFixMe[missing-local-annot] The type annotation(s) required by Flow's
 * LTI update could not be added via codemod */
function getPaths({added, modified, deleted}) {
  const addedPaths = [...added.values()].map(module => module.path);
  const modifiedPaths = [...modified.values()].map(module => module.path);

  return {
    added: new Set(addedPaths),
    modified: new Set(modifiedPaths),
    deleted,
  };
}

// Compute a delta between the keys of modules1 and modules2, in the same
// format returned by getPaths. Modified paths are passed in as modifiedPaths
// because our mocks don't actually model file contents.
function computeDelta(
  modules1: Set<string>,
  modules2: Dependencies<>,
  modifiedPaths: Set<string>,
) {
  const added = new Set();
  const modified = new Set();
  const deleted = new Set();

  for (const id of modules1.keys()) {
    if (!modules2.has(id)) {
      deleted.add(id);
    } else if (modifiedPaths.has(id)) {
      modified.add(id);
    }
  }

  for (const id of modules2.keys()) {
    if (!modules1.has(id)) {
      added.add(id);
    }
  }

  return {
    added,
    modified,
    deleted,
  };
}

function computeInverseDependencies(
  graph: {
    dependencies: Dependencies<>,
    entryPoints: $ReadOnlySet<string>,
    importBundleNames: Set<string>,
    privateState: PrivateState,
    transformOptions: TransformInputOptions,
  },
  options: {
    +experimentalImportBundleSupport: boolean,
    +onProgress: ?(numProcessed: number, total: number) => mixed,
    +resolve: (from: string, to: string) => string,
    +shallow: boolean,
    +transform: TransformFn<>,
    +transformOptions: TransformInputOptions,
  },
) {
  const allInverseDependencies = new Map();
  for (const path of graph.dependencies.keys()) {
    allInverseDependencies.set(path, new Set());
  }
  for (const module of graph.dependencies.values()) {
    for (const dependency of module.dependencies.values()) {
      if (
        options.experimentalImportBundleSupport &&
        dependency.data.data.asyncType != null
      ) {
        // Async deps aren't tracked in inverseDependencies
        continue;
      }
      const inverseDependencies =
        allInverseDependencies.get(dependency.absolutePath) ?? new Set();
      allInverseDependencies.set(dependency.absolutePath, inverseDependencies);

      inverseDependencies.add(module.path);
    }
  }
  return allInverseDependencies;
}

async function traverseDependencies(
  paths: Array<string>,
  graph: {
    dependencies: Dependencies<>,
    entryPoints: $ReadOnlySet<string>,
    importBundleNames: Set<string>,
    privateState: PrivateState,
    transformOptions: TransformInputOptions,
  },
  options: {
    +experimentalImportBundleSupport: boolean,
    +onProgress: ?(numProcessed: number, total: number) => mixed,
    +resolve: (from: string, to: string) => string,
    +shallow: boolean,
    +transform: TransformFn<>,
    +transformOptions: TransformInputOptions,
  },
) {
  // Get a snapshot of the graph before the traversal.
  const dependenciesBefore = new Set(graph.dependencies.keys());
  const pathsBefore = new Set(paths);

  // Mutate the graph and calculate a delta.
  const delta = await traverseDependenciesImpl(paths, graph, options);

  // Validate the delta against the current state of the graph.
  const expectedDelta = computeDelta(
    dependenciesBefore,
    graph.dependencies,
    pathsBefore,
  );
  expect(getPaths(delta)).toEqual(expectedDelta);

  // Ensure the inverseDependencies and dependencies sets are in sync.
  const expectedInverseDependencies = computeInverseDependencies(
    graph,
    options,
  );
  const actualInverseDependencies = new Map();
  for (const [path, module] of graph.dependencies) {
    actualInverseDependencies.set(path, new Set(module.inverseDependencies));
  }
  expect(actualInverseDependencies).toEqual(expectedInverseDependencies);

  return delta;
}

beforeEach(async () => {
  mockedDependencies = new Set();
  mockedDependencyTree = new Map();

  mockTransform = jest.fn().mockImplementation(async path => {
    return {
      dependencies: (mockedDependencyTree.get(path) || []).map(dep => ({
        name: dep.name,
        data: {
          asyncType: null,
          locs: [],
          ...dep.data,
        },
      })),
      getSource: () => Buffer.from('// source'),
      output: [
        {
          data: {
            code: '// code',
            lineCount: 1,
            map: [],
          },
          type: 'js/module',
        },
      ],
    };
  });

  options = {
    experimentalImportBundleSupport: false,
    onProgress: null,
    resolve: (from: string, to: string) => {
      const deps = nullthrows(mockedDependencyTree.get(from));
      const {path} = deps.filter(dep => dep.name === to)[0];

      if (!mockedDependencies.has(path)) {
        throw new Error(`Dependency not found: ${path}->${to}`);
      }
      return path;
    },
    transform: mockTransform,
    transformOptions: {
      // NOTE: These options are ignored because we mock out the transformer.
      dev: false,
      hot: false,
      minify: false,
      platform: null,
      runtimeBytecodeVersion: null,
      type: 'module',
      unstable_transformProfile: 'default',
    },
    shallow: false,
  };

  /*
  Generate the initial dependency graph:
  ┌─────────┐     ┌──────┐     ┌──────┐
  │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
  └─────────┘     └──────┘     └──────┘
                    │
                    │
                    ▼
                  ┌──────┐
                  │ /baz │
                  └──────┘
  */
  entryModule = Actions.createFile('/bundle');
  moduleFoo = Actions.createFile('/foo');
  moduleBar = Actions.createFile('/bar');
  moduleBaz = Actions.createFile('/baz');

  Actions.addDependency('/bundle', '/foo');
  Actions.addDependency('/foo', '/bar');
  Actions.addDependency('/foo', '/baz');

  files.clear();

  graph = createGraph({
    entryPoints: new Set(['/bundle']),
    transformOptions: options.transformOptions,
  });
});

it('should do the initial traversal correctly', async () => {
  const result = await initialTraverseDependencies(graph, options);

  expect(getPaths(result)).toEqual({
    added: new Set(['/bundle', '/foo', '/bar', '/baz']),
    modified: new Set(),
    deleted: new Set(),
  });

  // $FlowIgnore[incompatible-type] for snapshot purposes
  delete graph.privateState;
  expect(graph).toMatchSnapshot();
});

it('should populate all the inverse dependencies', async () => {
  // create a second inverse dependency on /bar.
  Actions.addDependency('/bundle', '/bar');

  await initialTraverseDependencies(graph, options);

  expect(
    nullthrows(graph.dependencies.get('/bar')).inverseDependencies,
  ).toEqual(new CountingSet(['/foo', '/bundle']));
});

it('should return an empty result when there are no changes', async () => {
  await initialTraverseDependencies(graph, options);

  expect(
    getPaths(await traverseDependencies(['/bundle'], graph, options)),
  ).toEqual({
    added: new Set(),
    modified: new Set(['/bundle']),
    deleted: new Set(),
  });
});

it('should return a removed dependency', async () => {
  await initialTraverseDependencies(graph, options);

  Actions.removeDependency('/foo', '/bar');

  expect(
    getPaths(await traverseDependencies([...files], graph, options)),
  ).toEqual({
    added: new Set(),
    modified: new Set(['/foo']),
    deleted: new Set(['/bar']),
  });
});

it('should return added/removed dependencies', async () => {
  await initialTraverseDependencies(graph, options);

  Actions.addDependency('/foo', '/qux');
  Actions.removeDependency('/foo', '/bar');
  Actions.removeDependency('/foo', '/baz');

  expect(
    getPaths(await traverseDependencies([...files], graph, options)),
  ).toEqual({
    added: new Set(['/qux']),
    modified: new Set(['/foo']),
    deleted: new Set(['/bar', '/baz']),
  });
});

it('should retry to traverse the dependencies as it was after getting an error', async () => {
  await initialTraverseDependencies(graph, options);

  Actions.deleteFile(moduleBar);

  await expect(
    traverseDependencies(['/foo'], graph, options),
  ).rejects.toBeInstanceOf(Error);

  // Second time that the traversal of dependencies we still have to throw an
  // error (no matter if no file has been changed).
  await expect(
    traverseDependencies(['/foo'], graph, options),
  ).rejects.toBeInstanceOf(Error);
});

it('should retry traversing dependencies after a transform error', async () => {
  class BadError extends Error {}

  const localOptions = {
    ...options,
    transform(path: string) {
      if (path === '/bad') {
        throw new BadError();
      }
      // $FlowFixMe[object-this-reference]: transform should not be bound to anything
      return options.transform.apply(this, arguments);
    },
  };

  await initialTraverseDependencies(graph, localOptions);

  Actions.createFile('/bad');
  Actions.addDependency('/foo', '/bad');

  await expect(
    traverseDependencies(['/foo'], graph, localOptions),
  ).rejects.toBeInstanceOf(BadError);

  // Repeated attempt should give the same error.
  await expect(
    traverseDependencies(['/foo'], graph, localOptions),
  ).rejects.toBeInstanceOf(BadError);

  // Finally, pass normal `options` that don't reject the '/bad' module:
  expect(
    getPaths(await traverseDependencies([...files], graph, options)),
  ).toEqual({
    added: new Set(['/bad']),
    modified: new Set(['/foo']),
    deleted: new Set(),
  });
});

it('should not traverse past the initial module if `shallow` is passed', async () => {
  const result = await initialTraverseDependencies(graph, {
    ...options,
    shallow: true,
  });

  expect(getPaths(result)).toEqual({
    added: new Set(['/bundle']),
    modified: new Set(),
    deleted: new Set(),
  });

  // $FlowIgnore[incompatible-type] for snapshot purposes
  delete graph.privateState;
  expect(graph).toMatchSnapshot();
});

describe('Progress updates', () => {
  it('calls back for each finished module', async () => {
    const onProgress = jest.fn();

    await initialTraverseDependencies(graph, {...options, onProgress});

    // We get a progress change twice per dependency
    // (when we discover it and when we process it).
    expect(onProgress.mock.calls.length).toBe(mockedDependencies.size * 2);
  });

  it('increases the number of discover/finished modules in steps of one', async () => {
    const onProgress = jest.fn();

    await initialTraverseDependencies(graph, {...options, onProgress});

    const lastCall = {
      num: 0,
      total: 0,
    };
    for (const call of onProgress.mock.calls) {
      expect(call[0]).toBeGreaterThanOrEqual(lastCall.num);
      expect(call[1]).toBeGreaterThanOrEqual(lastCall.total);

      expect(call[0] + call[1]).toEqual(lastCall.num + lastCall.total + 1);
      lastCall.num = call[0];
      lastCall.total = call[1];
    }
  });

  it('increases the number of discover/finished modules in steps of one when there are multiple entrypoints', async () => {
    const onProgress = jest.fn();

    // Add a new entry point to the graph.
    Actions.createFile('/bundle-2');
    Actions.addDependency('/bundle-2', '/qux');
    Actions.addDependency('/bundle-2', '/foo');
    graph.entryPoints = new Set(['/bundle', '/bundle-2']);

    await initialTraverseDependencies(graph, {...options, onProgress});

    const lastCall = {
      num: 0,
      total: 0,
    };
    for (const call of onProgress.mock.calls) {
      expect(call[0]).toBeGreaterThanOrEqual(lastCall.num);
      expect(call[1]).toBeGreaterThanOrEqual(lastCall.total);

      expect(call[0] + call[1]).toEqual(lastCall.num + lastCall.total + 1);
      lastCall.num = call[0];
      lastCall.total = call[1];
    }
  });
});

describe('edge cases', () => {
  it('should handle cyclic dependencies', async () => {
    Actions.addDependency('/baz', '/foo');
    files.clear();

    expect(getPaths(await initialTraverseDependencies(graph, options))).toEqual(
      {
        added: new Set(['/bundle', '/foo', '/bar', '/baz']),
        modified: new Set(),
        deleted: new Set(),
      },
    );

    expect(
      nullthrows(graph.dependencies.get('/foo')).inverseDependencies,
    ).toEqual(new CountingSet(['/baz', '/bundle']));
  });

  it('should handle renames correctly', async () => {
    await initialTraverseDependencies(graph, options);

    Actions.removeDependency('/foo', '/baz');
    Actions.moveFile('/baz', '/qux');
    Actions.addDependency('/foo', '/qux');

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(['/qux']),
      modified: new Set(['/foo']),
      deleted: new Set(['/baz']),
    });
  });

  it('should not try to remove wrong dependencies when renaming files', async () => {
    await initialTraverseDependencies(graph, options);

    // Rename /foo to /foo-renamed, but keeping all its dependencies.
    Actions.addDependency('/bundle', '/foo-renamed');
    Actions.removeDependency('/bundle', '/foo');

    Actions.moveFile('/foo', '/foo-renamed');
    Actions.addDependency('/foo-renamed', '/bar');
    Actions.addDependency('/foo-renamed', '/baz');

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(['/foo-renamed']),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo']),
    });

    expect(graph.dependencies.get('/foo')).toBe(undefined);
  });

  it('should handle file extension changes correctly', async () => {
    await initialTraverseDependencies(graph, options);

    Actions.removeDependency('/foo', '/baz');
    Actions.addDependency('/foo', '/baz.js', null, 'baz');

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(['/baz.js']),
      modified: new Set(['/foo']),
      deleted: new Set(['/baz']),
    });
  });

  it('modify a file and delete it afterwards', async () => {
    await initialTraverseDependencies(graph, options);

    Actions.modifyFile('/baz');
    Actions.removeDependency('/foo', '/baz');

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/foo']),
      deleted: new Set(['/baz']),
    });

    expect(graph.dependencies.get('/baz')).toBe(undefined);
  });

  it('remove a dependency and modify it afterwards', async () => {
    await initialTraverseDependencies(graph, options);

    Actions.removeDependency('/bundle', '/foo');
    Actions.modifyFile('/foo');

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar', '/baz']),
    });

    expect(graph.dependencies.get('/foo')).toBe(undefined);
    expect(graph.dependencies.get('/bar')).toBe(undefined);
    expect(graph.dependencies.get('/baz')).toBe(undefined);
  });

  it('removes a cyclic dependency but should not remove any dependency', async () => {
    Actions.createFile('/bar1');
    Actions.addDependency('/bar', '/bar1');
    Actions.addDependency('/bar1', '/foo');
    Actions.addDependency('/bundle', '/bar');
    files.clear();

    await initialTraverseDependencies(graph, options);

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set([]),
    });
  });

  it('removes cyclic leaf dependencies interchangeably', async () => {
    Actions.createFile('/core');
    Actions.createFile('/a');
    Actions.createFile('/b');
    Actions.addDependency('/core', '/a');
    Actions.addDependency('/core', '/b');
    Actions.addDependency('/a', '/baz');
    Actions.addDependency('/bundle', '/core');
    Actions.addDependency('/foo', '/core');
    files.clear();

    await initialTraverseDependencies(graph, options);

    Actions.removeDependency('/bundle', '/core');

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set([]),
    });

    Actions.addDependency('/bundle', '/core');

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set([]),
    });

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar']),
    });
  });

  it('removes a cyclic dependency with inverse dependency from other sub-graph', async () => {
    Actions.createFile('/toFoo');
    Actions.addDependency('/toFoo', '/baz');
    Actions.addDependency('/bundle', '/toFoo');
    files.clear();

    await initialTraverseDependencies(graph, options);

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar']),
    });
  });

  it('removes a cyclic dependency', async () => {
    Actions.addDependency('/baz', '/foo');
    files.clear();

    await initialTraverseDependencies(graph, options);

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar', '/baz']),
    });
  });

  it('removes a cyclic dependency which is both inverse dependency and direct dependency', async () => {
    Actions.addDependency('/foo', '/bundle');

    files.clear();

    await initialTraverseDependencies(graph, options);

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar', '/baz']),
    });
  });

  it('removes a dependency with transient cyclic dependency', async () => {
    Actions.createFile('/baz1');
    Actions.addDependency('/baz', '/baz1');
    Actions.addDependency('/baz1', '/foo');

    files.clear();

    await initialTraverseDependencies(graph, options);

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar', '/baz', '/baz1']),
    });
  });

  it('removes a sub graph that has internal cyclic dependency', async () => {
    Actions.createFile('/bar2');
    Actions.addDependency('/bar', '/bar2');
    Actions.addDependency('/bar2', '/bar');
    Actions.addDependency('/foo', '/bundle');

    files.clear();

    await initialTraverseDependencies(graph, options);

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar', '/baz', '/bar2']),
    });
  });

  it('move a file to a different folder', async () => {
    await initialTraverseDependencies(graph, options);

    Actions.addDependency('/foo', '/baz-moved');
    Actions.removeDependency('/foo', '/baz');

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(['/baz-moved']),
      modified: new Set(['/foo']),
      deleted: new Set(['/baz']),
    });

    expect(graph.dependencies.get('/baz')).toBe(undefined);
  });

  it('maintain the order of module dependencies', async () => {
    await initialTraverseDependencies(graph, options);

    Actions.addDependency('/foo', '/qux', 0);

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(['/qux']),
      modified: new Set(['/foo']),
      deleted: new Set(),
    });

    expect([
      ...nullthrows(graph.dependencies.get(moduleFoo)).dependencies,
    ]).toEqual([
      [
        'qux',
        {
          absolutePath: '/qux',
          data: {data: {asyncType: null, locs: []}, name: 'qux'},
        },
      ],
      [
        'bar',
        {
          absolutePath: '/bar',
          data: {data: {asyncType: null, locs: []}, name: 'bar'},
        },
      ],
      [
        'baz',
        {
          absolutePath: '/baz',
          data: {data: {asyncType: null, locs: []}, name: 'baz'},
        },
      ],
    ]);
  });

  describe('adding a new module while one of its ancestors is being deleted', () => {
    /**
     * In all of these tests, we make various mutations to the following graph:
     *
     * ┌─────────┐     ┌──────┐     ┌──────┐
     * │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
     * └─────────┘     └──────┘     └──────┘
     *                   │
     *                   │
     *                   ▼
     *                 ┌──────┐
     *                 │ /baz │
     *                 └──────┘
     *
     * The order and chunking of mutations should not affect the correctness of the graph
     * (but has been known to cause bugs, hence these regression tests).
     *
     * Terminology:
     *   * A "live" edge is one that makes it to the final state of graph.
     *   * A "dead" edge is one that is pruned from the final graph.
     */
    it('all in one delta, adding the live edge first', async () => {
      await initialTraverseDependencies(graph, options);

      /*
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
      ┏━━━━━━━━━┓     ┌──────┐
      ┃  /quux  ┃     │ /baz │
      ┗━━━━━━━━━┛     └──────┘
      */
      Actions.createFile('/quux');

      /*
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
        ┃	              │
        ┃               │
        ▼               ▼
      ┌─────────┐     ┌──────┐
      │  /quux  │     │ /baz │
      └─────────┘     └──────┘
      */
      Actions.addDependency('/bundle', '/quux');

      /*
      ┏━━━━━━━━━━━━━━━━━━━━┓
      ┃                    ┃
      ┃  ┌─────────┐     ┌──────┐     ┌──────┐
      ┃  │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      ┃  └─────────┘     └──────┘     └──────┘
      ┃    │               │
      ┃    │               │
      ┃    ▼               ▼
      ┃  ┌─────────┐     ┌──────┐
      ┗▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.addDependency('/foo', '/quux');

      /*
      ┌────────────────────┐
      │                    │
      │  ┌─────────┐   / ┌──────┐     ┌──────┐
      │  │ /bundle │ ┈/▷ │ /foo │ ──▶ │ /bar │
      │  └─────────┘ /   └──────┘     └──────┘
      │    │               │
      │    │               │
      │    ▼               ▼
      │  ┌─────────┐     ┌──────┐
      └▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.removeDependency('/bundle', '/foo');

      /*
      Compute the delta for the current graph:
      ┌─────────┐     ┌───────┐
      │ /bundle │ ──▶ │ /quux │
      └─────────┘     └───────┘
      (modified)       (added)
      */
      expect(
        getPaths(await traverseDependencies([...files], graph, options)),
      ).toEqual({
        added: new Set(['/quux']),
        deleted: new Set(['/foo', '/bar', '/baz']),
        modified: new Set(['/bundle']),
      });
    });

    it('all in one delta, adding the live edge after the dead edge', async () => {
      await initialTraverseDependencies(graph, options);

      /*
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
      ┏━━━━━━━━━┓     ┌──────┐
      ┃  /quux  ┃     │ /baz │
      ┗━━━━━━━━━┛     └──────┘
      */
      Actions.createFile('/quux');

      /*
      ┏━━━━━━━━━━━━━━━━━━━━┓
      ┃                    ┃
      ┃  ┌─────────┐     ┌──────┐     ┌──────┐
      ┃  │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      ┃  └─────────┘     └──────┘     └──────┘
      ┃                    │
      ┃                    │
      ┃                    ▼
      ┃  ┌─────────┐     ┌──────┐
      ┗▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.addDependency('/foo', '/quux');

      /*
      ┌────────────────────┐
      │                    │
      │  ┌─────────┐     ┌──────┐     ┌──────┐
      │  │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      │  └─────────┘     └──────┘     └──────┘
      │    ┃               │
      │    ┃               │
      │    ▼               ▼
      │  ┌─────────┐     ┌──────┐
      └▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.addDependency('/bundle', '/quux');

      /*
      ┌────────────────────┐
      │                    │
      │  ┌─────────┐   / ┌──────┐     ┌──────┐
      │  │ /bundle │ ┈/▷ │ /foo │ ──▶ │ /bar │
      │  └─────────┘ /   └──────┘     └──────┘
      │    │               │
      │    │               │
      │    ▼               ▼
      │  ┌─────────┐     ┌──────┐
      └▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.removeDependency('/bundle', '/foo');

      /*
      Compute the delta for the current graph:
      ┌─────────┐     ┌───────┐
      │ /bundle │ ──▶ │ /quux │
      └─────────┘     └───────┘
      (modified)       (added)
      */
      expect(
        getPaths(await traverseDependencies([...files], graph, options)),
      ).toEqual({
        added: new Set(['/quux']),
        deleted: new Set(['/foo', '/bar', '/baz']),
        modified: new Set(['/bundle']),
      });
    });

    it('add the dead edge, compute a delta, then add the live edge', async () => {
      await initialTraverseDependencies(graph, options);

      /*
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
      ┏━━━━━━━━━┓     ┌──────┐
      ┃  /quux  ┃     │ /baz │
      ┗━━━━━━━━━┛     └──────┘
      */
      Actions.createFile('/quux');

      /*
      ┏━━━━━━━━━━━━━━━━━━━━┓
      ┃                    ┃
      ┃  ┌─────────┐     ┌──────┐     ┌──────┐
      ┃  │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      ┃  └─────────┘     └──────┘     └──────┘
      ┃                    │
      ┃                    │
      ┃                    ▼
      ┃  ┌─────────┐     ┌──────┐
      ┗▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.addDependency('/foo', '/quux');

      /*
      Compute the delta for the current graph:
      ┌────────────────────┐
      │                    │
      │  ┌─────────┐     ┌──────┐       ┌──────┐
      │  │ /bundle │ ──▶ │ /foo │ ────▶ │ /bar │
      │  └─────────┘     └──────┘       └──────┘
      │                    │ (modified)
      │                    │
      │                    ▼
      │  ┌─────────┐     ┌──────┐
      └▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
           (added)
      */
      expect(
        getPaths(await traverseDependencies([...files], graph, options)),
      ).toEqual({
        added: new Set(['/quux']),
        deleted: new Set([]),
        modified: new Set(['/foo']),
      });
      files.clear();

      /*
      ┌────────────────────┐
      │                    │
      │  ┌─────────┐     ┌──────┐     ┌──────┐
      │  │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      │  └─────────┘     └──────┘     └──────┘
      │    ┃               │
      │    ┃               │
      │    ▼               ▼
      │  ┌─────────┐     ┌──────┐
      └▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.addDependency('/bundle', '/quux');

      /*
      ┌────────────────────┐
      │                    │
      │  ┌─────────┐   / ┌──────┐     ┌──────┐
      │  │ /bundle │ ┈/▷ │ /foo │ ──▶ │ /bar │
      │  └─────────┘ /   └──────┘     └──────┘
      │    │               │
      │    │               │
      │    ▼               ▼
      │  ┌─────────┐     ┌──────┐
      └▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.removeDependency('/bundle', '/foo');

      /*
      Compute another delta for the current graph:
      ┌─────────┐     ┌───────┐
      │ /bundle │ ──▶ │ /quux │
      └─────────┘     └───────┘
      (modified)
      */
      expect(
        getPaths(await traverseDependencies([...files], graph, options)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set(['/foo', '/bar', '/baz']),
        modified: new Set(['/bundle']),
      });
    });

    it('create the module, compute a delta, then add the dead edge and the live edge', async () => {
      await initialTraverseDependencies(graph, options);

      /*
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
      ┏━━━━━━━━━┓     ┌──────┐
      ┃  /quux  ┃     │ /baz │
      ┗━━━━━━━━━┛     └──────┘
      */
      Actions.createFile('/quux');

      /*
      Compute the delta for the current graph:
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      expect(
        getPaths(await traverseDependencies([...files], graph, options)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set([]),
        modified: new Set([]),
      });
      files.clear();

      /*
      ┏━━━━━━━━━━━━━━━━━━━━┓
      ┃                    ┃
      ┃  ┌─────────┐     ┌──────┐     ┌──────┐
      ┃  │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      ┃  └─────────┘     └──────┘     └──────┘
      ┃                    │
      ┃                    │
      ┃                    ▼
      ┃  ┌─────────┐     ┌──────┐
      ┗▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.addDependency('/foo', '/quux');

      /*
      Compute the delta for the current graph:
      ┌────────────────────┐
      │                    │
      │  ┌─────────┐     ┌──────┐       ┌──────┐
      │  │ /bundle │ ──▶ │ /foo │ ────▶ │ /bar │
      │  └─────────┘     └──────┘       └──────┘
      │                    │ (modified)
      │                    │
      │                    ▼
      │  ┌─────────┐     ┌──────┐
      └▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
           (added)
      */
      expect(
        getPaths(await traverseDependencies([...files], graph, options)),
      ).toEqual({
        added: new Set(['/quux']),
        deleted: new Set([]),
        modified: new Set(['/foo']),
      });
      files.clear();

      /*
      ┌────────────────────┐
      │                    │
      │  ┌─────────┐     ┌──────┐     ┌──────┐
      │  │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      │  └─────────┘     └──────┘     └──────┘
      │    ┃               │
      │    ┃               │
      │    ▼               ▼
      │  ┌─────────┐     ┌──────┐
      └▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.addDependency('/bundle', '/quux');

      /*
      ┌────────────────────┐
      │                    │
      │  ┌─────────┐   / ┌──────┐     ┌──────┐
      │  │ /bundle │ ┈/▷ │ /foo │ ──▶ │ /bar │
      │  └─────────┘ /   └──────┘     └──────┘
      │    │               │
      │    │               │
      │    ▼               ▼
      │  ┌─────────┐     ┌──────┐
      └▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.removeDependency('/bundle', '/foo');

      /*
      Compute another delta for the current graph:
      ┌─────────┐     ┌───────┐
      │ /bundle │ ──▶ │ /quux │
      └─────────┘     └───────┘
      (modified)
      */
      expect(
        getPaths(await traverseDependencies([...files], graph, options)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set(['/foo', '/bar', '/baz']),
        modified: new Set(['/bundle']),
      });
    });

    it('more than two state transitions in one delta calculation', async () => {
      await initialTraverseDependencies(graph, options);

      /*
      ┌─────────┐     ┌──────┐     ┌──────┐     ┏━━━━━━━┓
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │     ┃ /quux ┃
      └─────────┘     └──────┘     └──────┘     ┗━━━━━━━┛
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      Actions.createFile('/quux');

      /*
      Compute the delta for the current graph:
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      expect(
        getPaths(await traverseDependencies([...files], graph, options)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set([]),
        modified: new Set([]),
      });
      files.clear();

      /*
      ┌─────────┐     ┌──────┐     ┌──────┐     ┌───────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │ ━━▶ │ /quux │
      └─────────┘     └──────┘     └──────┘     └───────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      /bar is modified and reachable, so /quux will be marked as added
      ( = first transition).
      */
      Actions.addDependency('/bar', '/quux');

      /*
      ┌─────────┐     ┌──────┐   / ┌──────┐     ┌───────┐
      │ /bundle │ ──▶ │ /foo │ ┈/▷ │ /bar │ ──▶ │ /quux │
      └─────────┘     └──────┘ /   └──────┘     └───────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      /foo is modified and reachable, so we will see that /bar is unreachable
      and unmark /quux as added ( = second transition).
      */
      Actions.removeDependency('/foo', '/bar');

      /*
        ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
        ┃                                         ▼
      ┌─────────┐     ┌──────┐     ┌──────┐     ┌───────┐
      │ /bundle │ ──▶ │ /foo │     │ /bar │ ──▶ │ /quux │
      └─────────┘     └──────┘     └──────┘     └───────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      Finally, /bundle is modified and reachable, so we will mark /quux as
      added again ( = third transition)
      */
      Actions.addDependency('/bundle', '/quux');

      /*
      Compute another delta for the current graph:
      ┌─────────┐     ┌──────┐          ┌┈┈┈┈┈┈┐
      │ /bundle │ ──▶ │ /foo │          ┊ /bar ┊
      └─────────┘     └──────┘          └┈┈┈┈┈┈┘
        │ (modified)    │ (modified)    (deleted)
        │               │
        ▼               ▼
      ┌─────────┐     ┌──────┐
      │ /quux   │     │ /baz │
      └─────────┘     └──────┘
          (added)
      */
      expect(
        getPaths(await traverseDependencies([...files], graph, options)),
      ).toEqual({
        added: new Set(['/quux']),
        deleted: new Set(['/bar']),
        modified: new Set(['/foo', '/bundle']),
      });
    });
  });

  describe('lazy traversal of async imports', () => {
    let localOptions;
    beforeEach(() => {
      localOptions = {
        ...options,
        experimentalImportBundleSupport: true,
      };
    });

    it('async dependencies and their deps are omitted from the initial graph', async () => {
      Actions.removeDependency('/bundle', '/foo');
      Actions.addDependency('/bundle', '/foo', undefined, undefined, {
        asyncType: 'async',
      });

      /*
      ┌─────────┐  async   ┌──────┐     ┌──────┐
      │ /bundle │ ·······▶ │ /foo │ ──▶ │ /bar │
      └─────────┘          └──────┘     └──────┘
                            │
                            │
                            ▼
                          ┌──────┐
                          │ /baz │
                          └──────┘
      */
      expect(
        getPaths(await initialTraverseDependencies(graph, localOptions)),
      ).toEqual({
        added: new Set(['/bundle']),
        deleted: new Set([]),
        modified: new Set([]),
      });
      expect(graph.dependencies.get('/bar')).toBeUndefined();
    });

    it('initial async dependencies are collected in importBundleNames', async () => {
      Actions.removeDependency('/bundle', '/foo');
      Actions.addDependency('/bundle', '/foo', undefined, undefined, {
        asyncType: 'async',
      });

      /*
      ┌─────────┐  async   ┌──────┐     ┌──────┐
      │ /bundle │ ·······▶ │ /foo │ ──▶ │ /bar │
      └─────────┘          └──────┘     └──────┘
                            │
                            │
                            ▼
                          ┌──────┐
                          │ /baz │
                          └──────┘
      */
      await initialTraverseDependencies(graph, localOptions);
      expect(graph.importBundleNames).toEqual(new Set(['/foo']));
    });

    it('adding a new async dependency updates importBundleNames', async () => {
      Actions.removeDependency('/bundle', '/foo');
      Actions.addDependency('/bundle', '/foo', undefined, undefined, {
        asyncType: 'async',
      });

      /*
      ┌─────────┐  async   ┌──────┐     ┌──────┐
      │ /bundle │ ·······▶ │ /foo │ ──▶ │ /bar │
      └─────────┘          └──────┘     └──────┘
                            │
                            │
                            ▼
                          ┌──────┐
                          │ /baz │
                          └──────┘
      */
      await initialTraverseDependencies(graph, localOptions);
      files.clear();

      Actions.createFile('/quux');
      Actions.addDependency('/bundle', '/quux', undefined, undefined, {
        asyncType: 'async',
      });

      /*
      ┌─────────┐  async   ┌──────┐     ┌──────┐
      │ /bundle │ ·······▶ │ /foo │ ──▶ │ /bar │
      └─────────┘          └──────┘     └──────┘
        :                    │
        : async              │
        ▼                    ▼
      ┌─────────┐          ┌──────┐
      │  /quux  │          │ /baz │
      └─────────┘          └──────┘
      */
      expect(
        getPaths(await traverseDependencies([...files], graph, localOptions)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set([]),
        modified: new Set(['/bundle']),
      });
      expect(graph.importBundleNames).toEqual(new Set(['/foo', '/quux']));
    });

    it('changing a sync dependency to async is a deletion', async () => {
      /*
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      await initialTraverseDependencies(graph, localOptions);
      files.clear();

      Actions.removeDependency('/bundle', '/foo');
      Actions.addDependency('/bundle', '/foo', undefined, undefined, {
        asyncType: 'async',
      });

      /*
      ┌─────────┐  async   ┌──────┐     ┌──────┐
      │ /bundle │ ·······▶ │ /foo │ ──▶ │ /bar │
      └─────────┘          └──────┘     └──────┘
                            │
                            │
                            ▼
                          ┌──────┐
                          │ /baz │
                          └──────┘
      */
      expect(
        getPaths(await traverseDependencies([...files], graph, localOptions)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set(['/foo', '/bar', '/baz']),
        modified: new Set(['/bundle']),
      });
    });

    it('changing a sync dependency to async updates importBundleNames', async () => {
      /*
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      await initialTraverseDependencies(graph, localOptions);
      files.clear();

      Actions.removeDependency('/bundle', '/foo');
      Actions.addDependency('/bundle', '/foo', undefined, undefined, {
        asyncType: 'async',
      });

      /*
      ┌─────────┐  async   ┌──────┐     ┌──────┐
      │ /bundle │ ·······▶ │ /foo │ ──▶ │ /bar │
      └─────────┘          └──────┘     └──────┘
                            │
                            │
                            ▼
                          ┌──────┐
                          │ /baz │
                          └──────┘
      */
      await traverseDependencies([...files], graph, localOptions);
      expect(graph.importBundleNames).toEqual(new Set(['/foo']));
    });

    it('changing an async dependency to sync is an addition', async () => {
      Actions.removeDependency('/bundle', '/foo');
      Actions.addDependency('/bundle', '/foo', undefined, undefined, {
        asyncType: 'async',
      });

      /*
      ┌─────────┐  async   ┌──────┐     ┌──────┐
      │ /bundle │ ·······▶ │ /foo │ ──▶ │ /bar │
      └─────────┘          └──────┘     └──────┘
                            │
                            │
                            ▼
                          ┌──────┐
                          │ /baz │
                          └──────┘
      */
      await initialTraverseDependencies(graph, localOptions);
      files.clear();

      Actions.removeDependency('/bundle', '/foo');
      Actions.addDependency('/bundle', '/foo');

      /*
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      expect(
        getPaths(await traverseDependencies([...files], graph, localOptions)),
      ).toEqual({
        added: new Set(['/foo', '/bar', '/baz']),
        modified: new Set(['/bundle']),
        deleted: new Set([]),
      });
    });

    it('changing an async dependency to sync updates importBundleNames', async () => {
      Actions.removeDependency('/bundle', '/foo');
      Actions.addDependency('/bundle', '/foo', undefined, undefined, {
        asyncType: 'async',
      });

      /*
      ┌─────────┐  async   ┌──────┐     ┌──────┐
      │ /bundle │ ·······▶ │ /foo │ ──▶ │ /bar │
      └─────────┘          └──────┘     └──────┘
                            │
                            │
                            ▼
                          ┌──────┐
                          │ /baz │
                          └──────┘
      */
      await initialTraverseDependencies(graph, localOptions);
      files.clear();

      Actions.removeDependency('/bundle', '/foo');
      Actions.addDependency('/bundle', '/foo');

      /*
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      await traverseDependencies([...files], graph, localOptions);
      expect(graph.importBundleNames).toEqual(new Set());
    });

    it('initial graph can have async+sync edges to the same module', async () => {
      Actions.addDependency('/bar', '/foo', undefined, undefined, {
        asyncType: 'async',
      });

      /*
                                    async
                        ┌·················┐
                        ▼                 :
      ┌─────────┐     ┌──────┐          ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ───────▶ │ /bar │
      └─────────┘     └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      await initialTraverseDependencies(graph, localOptions);

      expect(graph.importBundleNames).toEqual(new Set(['/foo']));
      expect(graph.dependencies.get('/foo')).not.toBeUndefined();
    });

    it('adding an async edge pointing at an existing module in the graph', async () => {
      /*
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      await initialTraverseDependencies(graph, options);

      Actions.addDependency('/bar', '/foo', undefined, undefined, {
        asyncType: 'async',
      });

      /*
                                    async
                        ┌·················┐
                        ▼                 :
      ┌─────────┐     ┌──────┐          ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ───────▶ │ /bar │
      └─────────┘     └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      expect(
        getPaths(await traverseDependencies([...files], graph, localOptions)),
      ).toEqual({
        added: new Set([]),
        modified: new Set(['/bar']),
        deleted: new Set([]),
      });
      expect(graph.importBundleNames).toEqual(new Set(['/foo']));
    });

    it('adding a sync edge brings in a module that is already the target of an async edge', async () => {
      Actions.removeDependency('/foo', '/bar');
      Actions.addDependency('/foo', '/bar', undefined, undefined, {
        asyncType: 'async',
      });

      /*
      ┌─────────┐     ┌──────┐  async   ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ·······▶ │ /bar │
      └─────────┘     └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      await initialTraverseDependencies(graph, localOptions);
      files.clear();

      Actions.addDependency('/bundle', '/bar');

      /*
        ┌─────────────────────────────────┐
        │                                 ▼
      ┌─────────┐     ┌──────┐  async   ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ·······▶ │ /bar │
      └─────────┘     └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      expect(
        getPaths(await traverseDependencies([...files], graph, localOptions)),
      ).toEqual({
        added: new Set(['/bar']),
        modified: new Set(['/bundle']),
        deleted: new Set([]),
      });
      expect(graph.importBundleNames).toEqual(new Set(['/bar']));
    });

    it('on initial traversal, modules are not kept alive by a cycle with an async dep', async () => {
      Actions.removeDependency('/foo', '/bar');
      Actions.addDependency('/foo', '/bar', undefined, undefined, {
        asyncType: 'async',
      });
      Actions.addDependency('/bar', '/foo');
      Actions.removeDependency('/bundle', '/foo');

      /*
                        ┌─────────────────┐
                        ▼                 │
      ┌─────────┐     ┌──────┐  async   ┌──────┐
      │ /bundle │     │ /foo │ ·······▶ │ /bar │
      └─────────┘     └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      expect(
        getPaths(await initialTraverseDependencies(graph, localOptions)),
      ).toEqual({
        added: new Set(['/bundle']),
        deleted: new Set([]),
        modified: new Set([]),
      });
    });

    it('on incremental traversal, modules are not kept alive by a cycle with an async dep - deleting the sync edge in a delta', async () => {
      Actions.removeDependency('/foo', '/bar');
      Actions.addDependency('/foo', '/bar', undefined, undefined, {
        asyncType: 'async',
      });
      Actions.addDependency('/bar', '/foo');

      /*
                        ┌─────────────────┐
                        ▼                 │
      ┌─────────┐     ┌──────┐  async   ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ·······▶ │ /bar │
      └─────────┘     └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      await initialTraverseDependencies(graph, localOptions);
      files.clear();

      Actions.removeDependency('/bundle', '/foo');

      /*
                        ┌─────────────────┐
                        ▼                 │
      ┌─────────┐   / ┌──────┐  async   ┌──────┐
      │ /bundle │ ┈/▷ │ /foo │ ·······▶ │ /bar │
      └─────────┘ /   └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      expect(
        getPaths(await traverseDependencies([...files], graph, localOptions)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set(['/foo', '/baz']),
        modified: new Set(['/bundle']),
      });
      expect(graph.importBundleNames).toEqual(new Set());
    });

    it('on incremental traversal, modules are not kept alive by a cycle with an async dep - adding the async edge in a delta', async () => {
      Actions.removeDependency('/foo', '/bar');
      Actions.addDependency('/bar', '/foo');
      Actions.removeDependency('/bundle', '/foo');

      /*
                        ┌─────────────────┐
                        ▼                 │
      ┌─────────┐     ┌──────┐          ┌──────┐
      │ /bundle │     │ /foo │          │ /bar │
      └─────────┘     └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      await initialTraverseDependencies(graph, localOptions);
      files.clear();

      Actions.addDependency('/foo', '/bar', undefined, undefined, {
        asyncType: 'async',
      });

      /*
                        ┌─────────────────┐
                        ▼                 │
      ┌─────────┐     ┌──────┐          ┌──────┐
      │ /bundle │     │ /foo │ ───────▶ │ /bar │
      └─────────┘     └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      // At this point neither of /foo and /bar is reachable from /bundle.
      expect(
        getPaths(await traverseDependencies([...files], graph, localOptions)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set([]),
        modified: new Set([]),
      });
      expect(graph.importBundleNames).toEqual(new Set());
    });

    it('on incremental traversal, modules are not kept alive by a cycle with an async dep - deletion + add async in the same delta', async () => {
      Actions.removeDependency('/foo', '/bar');
      Actions.addDependency('/bar', '/foo');

      /*
                        ┌─────────────────┐
                        ▼                 │
      ┌─────────┐     ┌──────┐          ┌──────┐
      │ /bundle │ ──▶ │ /foo │          │ /bar │
      └─────────┘     └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      await initialTraverseDependencies(graph, localOptions);
      files.clear();

      Actions.addDependency('/foo', '/bar', undefined, undefined, {
        asyncType: 'async',
      });
      Actions.removeDependency('/bundle', '/foo');

      /*
                        ┌─────────────────┐
                        ▼                 │
      ┌─────────┐   / ┌──────┐  async   ┌──────┐
      │ /bundle │ ┈/▷ │ /foo │ ·······▶ │ /bar │
      └─────────┘ /   └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      expect(
        getPaths(await traverseDependencies([...files], graph, localOptions)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set(['/foo', '/baz']),
        modified: new Set(['/bundle']),
      });
      expect(graph.importBundleNames).toEqual(new Set());
    });
  });

  it('should try to transform every file only once', async () => {
    // create a second inverse dependency on /bar to add a cycle.
    Actions.addDependency('/bundle', '/bar');
    files.clear();

    await initialTraverseDependencies(graph, options);

    expect(mockTransform.mock.calls.length).toBe(4);
  });

  it('should try to transform every file only once with multiple entry points', async () => {
    Actions.createFile('/bundle-2');
    Actions.addDependency('/bundle-2', '/foo');
    files.clear();

    // Add a second entry point to the graph.
    graph.entryPoints = new Set(['/bundle', '/bundle-2']);

    await initialTraverseDependencies(graph, options);

    expect(mockTransform.mock.calls.length).toBe(5);
  });

  it('should create two entries when requiring the same file in different forms', async () => {
    await initialTraverseDependencies(graph, options);

    // We're adding a new reference from bundle to foo.
    Actions.addDependency('/bundle', '/foo', 0, 'foo.js');

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(),
    });

    expect([
      ...nullthrows(graph.dependencies.get(entryModule)).dependencies,
    ]).toEqual([
      [
        'foo.js',
        {
          absolutePath: '/foo',
          data: {
            data: {asyncType: null, locs: []},
            name: 'foo.js',
          },
        },
      ],
      [
        'foo',
        {
          absolutePath: '/foo',
          data: {
            data: {asyncType: null, locs: []},
            name: 'foo',
          },
        },
      ],
    ]);
  });

  it('should traverse a graph from multiple entry points', async () => {
    entryModule = Actions.createFile('/bundle-2');

    Actions.addDependency('/bundle-2', '/bundle-2-foo');
    Actions.addDependency('/bundle-2', '/bundle-2-bar');
    Actions.addDependency('/bundle-2', '/bar');

    files.clear();

    graph = createGraph({
      entryPoints: new Set(['/bundle', '/bundle-2']),
      transformOptions: options.transformOptions,
    });

    await initialTraverseDependencies(graph, options);

    expect([...graph.dependencies.keys()]).toEqual([
      '/bundle',
      '/foo',
      '/bar',
      '/baz',
      '/bundle-2',
      '/bundle-2-foo',
      '/bundle-2-bar',
    ]);
  });

  it('should traverse the dependency tree in a deterministic order', async () => {
    const localMockTransform = jest.fn();

    // Mocks the transformer call, always resolving the module in `slowPath`
    // after the module in `fastPath`.
    function setMockTransformOrder(fastPath: string, slowPath: string) {
      let deferredSlow;
      let fastResolved = false;

      localMockTransform.mockImplementation(async path => {
        const result = await mockTransform(path);

        if (path === slowPath && !fastResolved) {
          // Return a Promise that won't be resolved after fastPath.
          deferredSlow = deferred(result);
          return deferredSlow.promise;
        }

        if (path === fastPath) {
          fastResolved = true;

          if (deferredSlow) {
            return new Promise(async resolve => {
              await resolve(result);

              deferredSlow.resolve();
            });
          }
        }

        return result;
      });
    }

    const assertOrder = async function () {
      graph = createGraph({
        entryPoints: new Set(['/bundle']),
        transformOptions: options.transformOptions,
      });

      expect(
        Array.from(
          getPaths(
            await initialTraverseDependencies(graph, {
              ...options,
              transform: localMockTransform,
            }),
          ).added,
        ),
      ).toEqual(['/bundle', '/foo', '/baz', '/bar']);
    };

    // Create a dependency tree where moduleBaz has two inverse dependencies.
    mockedDependencyTree = new Map([
      [
        entryModule,
        [
          {name: 'foo', path: moduleFoo},
          {name: 'bar', path: moduleBar},
        ],
      ],
      [moduleFoo, [{name: 'baz', path: moduleBaz}]],
      [moduleBar, [{name: 'baz', path: moduleBaz}]],
    ]);

    // Test that even when having different modules taking longer, the order
    // remains the same.
    mockTransform.mockClear();
    setMockTransformOrder('/foo', '/bar');
    await assertOrder();
    expect(mockTransform).toHaveBeenCalledWith('/foo');
    expect(mockTransform).toHaveBeenCalledWith('/bar');

    mockTransform.mockClear();
    setMockTransformOrder('/bar', '/foo');
    await assertOrder();
    expect(mockTransform).toHaveBeenCalledWith('/bar');
    expect(mockTransform).toHaveBeenCalledWith('/foo');
  });
});

describe('reorderGraph', () => {
  it('should reorder any unordered graph in DFS order', async () => {
    const dep = (path: string) => ({
      absolutePath: path,
      data: {
        data: {
          asyncType: null,
          locs: [],
        },
        name: path.substr(1),
      },
    });

    const mod = (moduleData: {
      dependencies: Map<string, Dependency>,
      path: string,
    }) => ({
      ...moduleData,
      output: [],
      getSource: () => Buffer.from('// source'),
      // NOTE: inverseDependencies is traversal state/output, not input, so we
      // don't pre-populate it.
      inverseDependencies: new CountingSet(),
    });

    const graph = createGraph({
      entryPoints: new Set(['/a', '/b']),
      transformOptions: options.transformOptions,
    });
    // prettier-ignore
    graph.dependencies = new Map([
      ['/2', mod({path: '/2', dependencies: new Map()})],
      ['/0', mod({path: '/0', dependencies: new Map([['/1', dep('/1')], ['/2', dep('/2')]])})],
      ['/1', mod({path: '/1', dependencies: new Map([['/2', dep('/2')]])})],
      ['/3', mod({path: '/3', dependencies: new Map([])})],
      ['/b', mod({path: '/b', dependencies: new Map([['/3', dep('/3')]])})],
      ['/a', mod({path: '/a', dependencies: new Map([['/0', dep('/0')]])})],
    ]);

    reorderGraph(graph, {shallow: false});

    expect([...graph.dependencies.keys()]).toEqual([
      '/a',
      '/0',
      '/1',
      '/2',
      '/b',
      '/3',
    ]);
  });
});

describe('optional dependencies', () => {
  let localGraph;
  let localOptions;
  const getAllDependencies = () => {
    const all = new Set();
    mockedDependencyTree.forEach(deps => {
      deps.forEach(r => all.add(r.name));
    });
    return all;
  };
  const assertResults = (
    dependencies: Map<string, Module<>>,
    expectedMissing: Array<string>,
  ) => {
    let count = 0;
    const allDependency = getAllDependencies();
    allDependency.forEach(m => {
      const data = dependencies.get(`/${m}`);
      if (expectedMissing.includes(m)) {
        expect(data).toBeUndefined();
      } else {
        expect(data).not.toBeUndefined();
      }
      count += 1;
    });
    expect(count).toBeGreaterThan(0);
    expect(count).toBe(allDependency.size);
  };

  const createMockTransform = (notOptional?: string[]) => {
    return async function (path: string) {
      // $FlowFixMe[object-this-reference]: transform should not be bound to anything
      const result = await mockTransform.apply(this, arguments);
      return {
        ...result,
        dependencies: result.dependencies.map(dep => {
          let isOptional;
          if (notOptional && notOptional.includes(dep.name)) {
            isOptional = false;
          } else {
            isOptional = dep.name.includes('optional-');
          }
          return {
            ...dep,
            data: {
              ...dep.data,
              isOptional,
            },
          };
        }),
      };
    };
  };

  beforeEach(() => {
    mockedDependencies = new Set();
    mockedDependencyTree = new Map();

    entryModule = Actions.createFile('/bundle-o');

    Actions.addDependency('/bundle-o', '/regular-a');
    Actions.addDependency('/bundle-o', '/optional-b');

    Actions.deleteFile('/optional-b');

    localGraph = createGraph({
      entryPoints: new Set(['/bundle-o']),
      transformOptions: options.transformOptions,
    });
  });

  it('missing optional dependency will be skipped', async () => {
    localOptions = {
      ...options,
      transform: createMockTransform(),
    };

    const result = await initialTraverseDependencies(localGraph, localOptions);

    const dependencies = result.added;
    assertResults(dependencies, ['optional-b']);
  });
  it('missing non-optional dependency will throw', async () => {
    localOptions = {
      ...options,
      transform: createMockTransform(['optional-b']),
    };
    await expect(
      initialTraverseDependencies(localGraph, localOptions),
    ).rejects.toThrow();
  });
});

describe('parallel edges', () => {
  it('add twice w/ same key, build and remove once', async () => {
    // Create a second edge between /foo and /bar.
    Actions.addDependency('/foo', '/bar', undefined);

    await initialTraverseDependencies(graph, options);

    const fooDeps = nullthrows(graph.dependencies.get('/foo')).dependencies;
    const fooDepsResolved = [...fooDeps.values()].map(dep => dep.absolutePath);
    // We dedupe the dependencies because they have the same `name`.
    expect(fooDepsResolved).toEqual(['/bar', '/baz']);

    // Remove one of the edges between /foo and /bar (arbitrarily)
    Actions.removeDependency('/foo', '/bar');

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/foo']),
      deleted: new Set(),
    });
  });

  it('add twice w/ same key, build and remove twice', async () => {
    // Create a second edge between /foo and /bar.
    Actions.addDependency('/foo', '/bar', undefined);

    await initialTraverseDependencies(graph, options);

    const fooDeps = nullthrows(graph.dependencies.get('/foo')).dependencies;
    const fooDepsResolved = [...fooDeps.values()].map(dep => dep.absolutePath);
    // We dedupe the dependencies because they have the same `name`.
    expect(fooDepsResolved).toEqual(['/bar', '/baz']);

    // Remove both edges between /foo and /bar
    Actions.removeDependency('/foo', '/bar');
    Actions.removeDependency('/foo', '/bar');

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/foo']),
      deleted: new Set(['/bar']),
    });
  });

  it('add twice w/ different keys, build and remove once', async () => {
    // Create a second edge between /foo and /bar, with a different `name`.
    Actions.addDependency('/foo', '/bar', undefined, 'bar-second');

    await initialTraverseDependencies(graph, options);

    const fooDeps = nullthrows(graph.dependencies.get('/foo')).dependencies;
    const fooDepsResolved = [...fooDeps.values()].map(dep => dep.absolutePath);
    // We don't dedupe the dependencies because they have different `name`s.
    expect(fooDepsResolved).toEqual(['/bar', '/baz', '/bar']);

    // Remove one of the edges between /foo and /bar (arbitrarily)
    Actions.removeDependency('/foo', '/bar');

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/foo']),
      deleted: new Set(),
    });
  });

  it('add twice w/ different keys, build and remove twice', async () => {
    // Create a second edge between /foo and /bar, with a different `name`.
    Actions.addDependency('/foo', '/bar', undefined, 'bar-second');

    await initialTraverseDependencies(graph, options);

    const fooDeps = nullthrows(graph.dependencies.get('/foo')).dependencies;
    const fooDepsResolved = [...fooDeps.values()].map(dep => dep.absolutePath);
    // We don't dedupe the dependencies because they have different `name`s.
    expect(fooDepsResolved).toEqual(['/bar', '/baz', '/bar']);

    // Remove both edges between /foo and /bar
    Actions.removeDependency('/foo', '/bar');
    Actions.removeDependency('/foo', '/bar');

    expect(
      getPaths(await traverseDependencies([...files], graph, options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/foo']),
      deleted: new Set(['/bar']),
    });
  });
});
