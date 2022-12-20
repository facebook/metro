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

import type {
  Dependency,
  MixedOutput,
  Module,
  Options,
  ReadOnlyDependencies,
  ReadOnlyGraph,
  TransformResultDependency,
  TransformResultWithSource,
} from '../types.flow';
import type {Result} from '../Graph';
import type {RequireContext} from '../../lib/contextModule';

import CountingSet from '../../lib/CountingSet';
import {deriveAbsolutePathFromContext} from '../../lib/contextModule';
import nullthrows from 'nullthrows';

import {Graph} from '../Graph';

const {objectContaining} = expect;

type DependencyDataInput = $Shape<TransformResultDependency['data']>;

let mockedDependencies: Set<string> = new Set();
let mockedDependencyTree: Map<
  string,
  Array<
    $ReadOnly<{
      name: string,
      path: string,
      data: DependencyDataInput,
    }>,
  >,
> = new Map();
const files = new Set<string>();
let graph: TestGraph;
let options;

let entryModule;
let moduleFoo;
let moduleBar;
let moduleBaz;

let mockTransform;

const getMockDependency = (path: string) => {
  const deps = mockedDependencyTree.get(path);
  if (!deps) {
    throw new Error(`No mock dependency named: ${path}`);
  }
  return deps;
};

const Actions = {
  modifyFile(path: string) {
    if (mockedDependencies.has(path)) {
      files.add(path);
    }
  },

  moveFile(from: string, to: string, graph: Graph<>) {
    Actions.createFile(to);
    Actions.deleteFile(from, graph);
  },

  deleteFile(path: string, graph: Graph<>) {
    mockedDependencies.delete(path);
    for (const modifiedPath of graph.getModifiedModulesForDeletedPath(path)) {
      Actions.modifyFile(modifiedPath);
    }
  },

  createFile(path: string): string {
    mockedDependencies.add(path);
    mockedDependencyTree.set(path, []);

    return path;
  },

  addDependency(
    path: string,
    dependencyPath: string,
    options: {
      position?: ?number,
      name?: string,
      data?: DependencyDataInput,
    } = {},
  ) {
    Actions.addInferredDependency(path, dependencyPath, options);
    files.add(path);
  },

  addInferredDependency(
    path: string,
    dependencyPath: string,
    {
      position,
      name,
      data,
    }: {
      position?: ?number,
      name?: string,
      data?: DependencyDataInput,
    } = {},
  ): void {
    if (!mockedDependencies.has(path)) {
      Actions.createFile(path);
    }
    const deps = getMockDependency(path);
    const depName = name ?? dependencyPath.replace('/', '');
    const key = require('crypto')
      .createHash('sha1')
      .update(depName)
      .digest('base64');
    const dep = {
      name: depName,
      path: dependencyPath,
      data: {key, ...(data ?? {})},
    };
    if (
      deps.findIndex(existingDep => existingDep.data.key === dep.data.key) !==
      -1
    ) {
      throw new Error('Found existing mock dep with key: ' + dep.data.key);
    }
    if (position == null) {
      deps.push(dep);
    } else {
      deps.splice(position, 0, dep);
    }

    mockedDependencyTree.set(path, deps);
    mockedDependencies.add(dependencyPath);
  },

  removeDependency(path: string, dependencyPath: string) {
    Actions.removeInferredDependency(path, dependencyPath);

    files.add(path);
  },

  removeInferredDependency(path: string, dependencyPath: string) {
    const deps = nullthrows(mockedDependencyTree.get(path));

    const index = deps.findIndex(({path}) => path === dependencyPath);
    if (index !== -1) {
      deps.splice(index, 1);
      mockedDependencyTree.set(path, deps);
    }
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
  modules2: ReadOnlyDependencies<>,
  modifiedPaths: Set<string>,
) {
  const added = new Set<string>();
  const modified = new Set<string>();
  const deleted = new Set<string>();

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
  graph: ReadOnlyGraph<>,
  options: Options<>,
) {
  const allInverseDependencies = new Map<string, Set<string>>();
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

class TestGraph extends Graph<> {
  async traverseDependencies(
    paths: $ReadOnlyArray<string>,
    options: Options<>,
  ): Promise<Result<MixedOutput>> {
    // Get a snapshot of the graph before the traversal.
    const dependenciesBefore = new Set(this.dependencies.keys());
    const pathsBefore = new Set(paths);

    // Mutate the graph and calculate a delta.
    const delta = await super.traverseDependencies(paths, options);

    // Validate the delta against the current state of the graph.
    const expectedDelta = computeDelta(
      dependenciesBefore,
      this.dependencies,
      pathsBefore,
    );
    expect(getPaths(delta)).toEqual(expectedDelta);

    // Ensure the inverseDependencies and dependencies sets are in sync.
    const expectedInverseDependencies = computeInverseDependencies(
      this,
      options,
    );
    const actualInverseDependencies = new Map<string, Set<string>>();
    for (const [path, module] of graph.dependencies) {
      actualInverseDependencies.set(path, new Set(module.inverseDependencies));
    }
    expect(actualInverseDependencies).toEqual(expectedInverseDependencies);

    return delta;
  }
}

function getMatchingContextModules<T>(graph: Graph<T>, filePath: string) {
  const contextPaths = new Set<string>();
  graph.markModifiedContextModules(filePath, contextPaths);
  return contextPaths;
}

beforeEach(async () => {
  mockedDependencies = new Set();
  mockedDependencyTree = new Map();

  mockTransform = jest
    .fn<
      [string, ?RequireContext],
      Promise<TransformResultWithSource<MixedOutput>>,
    >()
    .mockImplementation(async (path: string, context: ?RequireContext) => {
      return {
        dependencies: (mockedDependencyTree.get(path) || []).map(dep => ({
          name: dep.name,
          data: {
            asyncType: null,
            locs: [],
            key: dep.data.key,
            ...dep.data,
          },
        })),
        getSource: () =>
          Buffer.from('// source' + (context ? ' (context)' : '')),
        output: [
          {
            data: {
              code: '// code' + (context ? ' (context)' : ''),
              lineCount: 1,
              map: [],
            },
            type: 'js/module',
          },
        ],
      };
    });

  options = {
    unstable_allowRequireContext: false,
    experimentalImportBundleSupport: false,
    onProgress: null,
    resolve: (from: string, to: string) => {
      const deps = getMockDependency(from);
      const {path} = deps.filter(dep => dep.name === to)[0];

      if (!mockedDependencies.has(path)) {
        throw new Error(`Dependency not found: ${from} -> ${path}`);
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

  graph = new TestGraph({
    entryPoints: new Set(['/bundle']),
    transformOptions: options.transformOptions,
  });
});

it('should do the initial traversal correctly', async () => {
  const result = await graph.initialTraverseDependencies(options);

  expect(getPaths(result)).toEqual({
    added: new Set(['/bundle', '/foo', '/bar', '/baz']),
    modified: new Set(),
    deleted: new Set(),
  });

  expect(graph).toMatchSnapshot();
});

it('should populate all the inverse dependencies', async () => {
  // create a second inverse dependency on /bar.
  Actions.addDependency('/bundle', '/bar');

  await graph.initialTraverseDependencies(options);

  expect(
    nullthrows(graph.dependencies.get('/bar')).inverseDependencies,
  ).toEqual(new CountingSet(['/foo', '/bundle']));
});

it('should return an empty result when there are no changes', async () => {
  await graph.initialTraverseDependencies(options);

  expect(
    getPaths(await graph.traverseDependencies(['/bundle'], options)),
  ).toEqual({
    added: new Set(),
    modified: new Set(['/bundle']),
    deleted: new Set(),
  });
});

it('should return a removed dependency', async () => {
  await graph.initialTraverseDependencies(options);

  Actions.removeDependency('/foo', '/bar');

  expect(
    getPaths(await graph.traverseDependencies([...files], options)),
  ).toEqual({
    added: new Set(),
    modified: new Set(['/foo']),
    deleted: new Set(['/bar']),
  });
});

it('should return added/removed dependencies', async () => {
  await graph.initialTraverseDependencies(options);

  Actions.addDependency('/foo', '/qux');
  Actions.removeDependency('/foo', '/bar');
  Actions.removeDependency('/foo', '/baz');

  expect(
    getPaths(await graph.traverseDependencies([...files], options)),
  ).toEqual({
    added: new Set(['/qux']),
    modified: new Set(['/foo']),
    deleted: new Set(['/bar', '/baz']),
  });
});

it('should retry to traverse the dependencies as it was after getting an error', async () => {
  await graph.initialTraverseDependencies(options);

  Actions.deleteFile(moduleBar, graph);

  await expect(
    graph.traverseDependencies(['/foo'], options),
  ).rejects.toBeInstanceOf(Error);

  // Second time that the traversal of dependencies we still have to throw an
  // error (no matter if no file has been changed).
  await expect(
    graph.traverseDependencies(['/foo'], options),
  ).rejects.toBeInstanceOf(Error);
});

it('should retry traversing dependencies after a transform error', async () => {
  class BadError extends Error {}

  const localOptions = {
    ...options,
    transform(path: string, context: ?RequireContext) {
      if (path === '/bad') {
        throw new BadError();
      }
      // $FlowFixMe[object-this-reference]: transform should not be bound to anything
      return options.transform.call(this, path, context);
    },
  };

  await graph.initialTraverseDependencies(localOptions);

  Actions.createFile('/bad');
  Actions.addDependency('/foo', '/bad');

  await expect(
    graph.traverseDependencies(['/foo'], localOptions),
  ).rejects.toBeInstanceOf(BadError);

  // Repeated attempt should give the same error.
  await expect(
    graph.traverseDependencies(['/foo'], localOptions),
  ).rejects.toBeInstanceOf(BadError);

  // Finally, pass normal `options` that don't reject the '/bad' module:
  expect(
    getPaths(await graph.traverseDependencies([...files], options)),
  ).toEqual({
    added: new Set(['/bad']),
    modified: new Set(['/foo']),
    deleted: new Set(),
  });
});

it('should not traverse past the initial module if `shallow` is passed', async () => {
  const result = await graph.initialTraverseDependencies({
    ...options,
    shallow: true,
  });

  expect(getPaths(result)).toEqual({
    added: new Set(['/bundle']),
    modified: new Set(),
    deleted: new Set(),
  });

  expect(graph).toMatchSnapshot();
});

describe('Progress updates', () => {
  it('calls back for each finished module', async () => {
    const onProgress = jest.fn();

    await graph.initialTraverseDependencies({...options, onProgress});

    // We get a progress change twice per dependency
    // (when we discover it and when we process it).
    expect(onProgress.mock.calls.length).toBe(mockedDependencies.size * 2);
  });

  it('increases the number of discover/finished modules in steps of one', async () => {
    const onProgress = jest.fn();

    await graph.initialTraverseDependencies({...options, onProgress});

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
    graph = new TestGraph({
      entryPoints: new Set(['/bundle', '/bundle-2']),
      transformOptions: options.transformOptions,
    });

    await graph.initialTraverseDependencies({...options, onProgress});

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

    expect(getPaths(await graph.initialTraverseDependencies(options))).toEqual({
      added: new Set(['/bundle', '/foo', '/bar', '/baz']),
      modified: new Set(),
      deleted: new Set(),
    });

    expect(
      nullthrows(graph.dependencies.get('/foo')).inverseDependencies,
    ).toEqual(new CountingSet(['/baz', '/bundle']));
  });

  it('should handle renames correctly', async () => {
    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/foo', '/baz');
    Actions.moveFile('/baz', '/qux', graph);
    Actions.addDependency('/foo', '/qux');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(['/qux']),
      modified: new Set(['/foo']),
      deleted: new Set(['/baz']),
    });
  });

  it('should not try to remove wrong dependencies when renaming files', async () => {
    await graph.initialTraverseDependencies(options);

    // Rename /foo to /foo-renamed, but keeping all its dependencies.
    Actions.addDependency('/bundle', '/foo-renamed');
    Actions.removeDependency('/bundle', '/foo');

    Actions.moveFile('/foo', '/foo-renamed', graph);
    Actions.addDependency('/foo-renamed', '/bar');
    Actions.addDependency('/foo-renamed', '/baz');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(['/foo-renamed']),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo']),
    });

    expect(graph.dependencies.get('/foo')).toBe(undefined);
  });

  it('should handle file extension changes correctly', async () => {
    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/foo', '/baz');
    Actions.addDependency('/foo', '/baz.js', {name: 'baz'});

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(['/baz.js']),
      modified: new Set(['/foo']),
      deleted: new Set(['/baz']),
    });
  });

  it('modify a file and delete it afterwards', async () => {
    await graph.initialTraverseDependencies(options);

    Actions.modifyFile('/baz');
    Actions.removeDependency('/foo', '/baz');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/foo']),
      deleted: new Set(['/baz']),
    });

    expect(graph.dependencies.get('/baz')).toBe(undefined);
  });

  it('remove a dependency and modify it afterwards', async () => {
    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/bundle', '/foo');
    Actions.modifyFile('/foo');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
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

    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
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

    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/bundle', '/core');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set([]),
    });

    Actions.addDependency('/bundle', '/core');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set([]),
    });

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
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

    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar']),
    });
  });

  it('removes a cyclic dependency', async () => {
    Actions.addDependency('/baz', '/foo');
    files.clear();

    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar', '/baz']),
    });
  });

  it('removes a cyclic dependency which is both inverse dependency and direct dependency', async () => {
    Actions.addDependency('/foo', '/bundle');

    files.clear();

    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
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

    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
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

    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar', '/baz', '/bar2']),
    });
  });

  it('move a file to a different folder', async () => {
    await graph.initialTraverseDependencies(options);

    Actions.addDependency('/foo', '/baz-moved');
    Actions.removeDependency('/foo', '/baz');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(['/baz-moved']),
      modified: new Set(['/foo']),
      deleted: new Set(['/baz']),
    });

    expect(graph.dependencies.get('/baz')).toBe(undefined);
  });

  it('maintain the order of module dependencies', async () => {
    await graph.initialTraverseDependencies(options);

    Actions.addDependency('/foo', '/qux', {position: 0});

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(['/qux']),
      modified: new Set(['/foo']),
      deleted: new Set(),
    });

    expect([
      ...nullthrows(graph.dependencies.get(moduleFoo)).dependencies,
    ]).toEqual([
      [
        expect.any(String),
        {
          absolutePath: '/qux',
          data: {
            data: objectContaining({asyncType: null, locs: []}),
            name: 'qux',
          },
        },
      ],
      [
        expect.any(String),
        {
          absolutePath: '/bar',
          data: {
            data: objectContaining({asyncType: null, locs: []}),
            name: 'bar',
          },
        },
      ],
      [
        expect.any(String),
        {
          absolutePath: '/baz',
          data: {
            data: objectContaining({asyncType: null, locs: []}),
            name: 'baz',
          },
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
      await graph.initialTraverseDependencies(options);

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
        getPaths(await graph.traverseDependencies([...files], options)),
      ).toEqual({
        added: new Set(['/quux']),
        deleted: new Set(['/foo', '/bar', '/baz']),
        modified: new Set(['/bundle']),
      });
    });

    it('all in one delta, adding the live edge after the dead edge', async () => {
      await graph.initialTraverseDependencies(options);

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
        getPaths(await graph.traverseDependencies([...files], options)),
      ).toEqual({
        added: new Set(['/quux']),
        deleted: new Set(['/foo', '/bar', '/baz']),
        modified: new Set(['/bundle']),
      });
    });

    it('add the dead edge, compute a delta, then add the live edge', async () => {
      await graph.initialTraverseDependencies(options);

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
        getPaths(await graph.traverseDependencies([...files], options)),
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
        getPaths(await graph.traverseDependencies([...files], options)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set(['/foo', '/bar', '/baz']),
        modified: new Set(['/bundle']),
      });
    });

    it('create the module, compute a delta, then add the dead edge and the live edge', async () => {
      await graph.initialTraverseDependencies(options);

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
        getPaths(await graph.traverseDependencies([...files], options)),
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
        getPaths(await graph.traverseDependencies([...files], options)),
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
        getPaths(await graph.traverseDependencies([...files], options)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set(['/foo', '/bar', '/baz']),
        modified: new Set(['/bundle']),
      });
    });

    it('more than two state transitions in one delta calculation', async () => {
      await graph.initialTraverseDependencies(options);

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
        getPaths(await graph.traverseDependencies([...files], options)),
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
        getPaths(await graph.traverseDependencies([...files], options)),
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
      Actions.addDependency('/bundle', '/foo', {
        data: {
          asyncType: 'async',
        },
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
        getPaths(await graph.initialTraverseDependencies(localOptions)),
      ).toEqual({
        added: new Set(['/bundle']),
        deleted: new Set([]),
        modified: new Set([]),
      });
      expect(graph.dependencies.get('/bar')).toBeUndefined();
    });

    it('new async dependencies are not traversed', async () => {
      Actions.removeDependency('/bundle', '/foo');
      Actions.addDependency('/bundle', '/foo', {
        data: {
          asyncType: 'async',
        },
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
      await graph.initialTraverseDependencies(localOptions);
      files.clear();

      Actions.createFile('/quux');
      Actions.addDependency('/bundle', '/quux', {
        data: {
          asyncType: 'async',
        },
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
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set([]),
        modified: new Set(['/bundle']),
      });
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
      await graph.initialTraverseDependencies(localOptions);
      files.clear();

      Actions.removeDependency('/bundle', '/foo');
      Actions.addDependency('/bundle', '/foo', {
        data: {
          asyncType: 'async',
        },
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
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set(['/foo', '/bar', '/baz']),
        modified: new Set(['/bundle']),
      });
    });

    it('changing an async dependency to sync is an addition', async () => {
      Actions.removeDependency('/bundle', '/foo');
      Actions.addDependency('/bundle', '/foo', {
        data: {
          asyncType: 'async',
        },
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
      await graph.initialTraverseDependencies(localOptions);
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
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set(['/foo', '/bar', '/baz']),
        modified: new Set(['/bundle']),
        deleted: new Set([]),
      });
    });

    it('initial graph can have async+sync edges to the same module', async () => {
      Actions.addDependency('/bar', '/foo', {
        data: {
          asyncType: 'async',
        },
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
      await graph.initialTraverseDependencies(localOptions);

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
      await graph.initialTraverseDependencies(options);

      Actions.addDependency('/bar', '/foo', {
        data: {
          asyncType: 'async',
        },
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
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set([]),
        modified: new Set(['/bar']),
        deleted: new Set([]),
      });
    });

    it('adding a sync edge brings in a module that is already the target of an async edge', async () => {
      Actions.removeDependency('/foo', '/bar');
      Actions.addDependency('/foo', '/bar', {
        data: {
          asyncType: 'async',
        },
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
      await graph.initialTraverseDependencies(localOptions);
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
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set(['/bar']),
        modified: new Set(['/bundle']),
        deleted: new Set([]),
      });
    });

    it('on initial traversal, modules are not kept alive by a cycle with an async dep', async () => {
      Actions.removeDependency('/foo', '/bar');
      Actions.addDependency('/foo', '/bar', {
        data: {
          asyncType: 'async',
        },
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
        getPaths(await graph.initialTraverseDependencies(localOptions)),
      ).toEqual({
        added: new Set(['/bundle']),
        deleted: new Set([]),
        modified: new Set([]),
      });
    });

    it('on incremental traversal, modules are not kept alive by a cycle with an async dep - deleting the sync edge in a delta', async () => {
      Actions.removeDependency('/foo', '/bar');
      Actions.addDependency('/foo', '/bar', {
        data: {
          asyncType: 'async',
        },
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
      await graph.initialTraverseDependencies(localOptions);
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
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set(['/foo', '/baz']),
        modified: new Set(['/bundle']),
      });
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
      await graph.initialTraverseDependencies(localOptions);
      files.clear();

      Actions.addDependency('/foo', '/bar', {
        data: {
          asyncType: 'async',
        },
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
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set([]),
        modified: new Set([]),
      });
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
      await graph.initialTraverseDependencies(localOptions);
      files.clear();

      Actions.addDependency('/foo', '/bar', {
        data: {
          asyncType: 'async',
        },
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
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set(['/foo', '/baz']),
        modified: new Set(['/bundle']),
      });
    });

    it('deleting the target of an async dependency retraverses its parent', async () => {
      Actions.removeDependency('/bundle', '/foo');
      Actions.addDependency('/bundle', '/foo', {
        data: {
          asyncType: 'async',
        },
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
      await graph.initialTraverseDependencies(localOptions);
      files.clear();

      Actions.deleteFile('/foo', graph);

      /*
      ┌─────────┐  async   ┌┄┄╲┄╱┄┐     ┌──────┐
      │ /bundle │ ·······▶ ┆ /foo ┆ ──▶ │ /bar │
      └─────────┘          └┄┄╱┄╲┄┘     └──────┘
                            │
                            │
                            ▼
                          ┌──────┐
                          │ /baz │
                          └──────┘
      */
      await expect(
        graph.traverseDependencies([...files], localOptions),
      ).rejects.toThrowError('Dependency not found: /bundle -> /foo');

      // NOTE: not clearing `files`, to mimic DeltaCalculator's error behaviour.

      Actions.createFile('/foo');

      /*
      ┌─────────┐  async   ┏━━━━━━┓     ┌──────┐
      │ /bundle │ ·······▶ ┃ /foo ┃ ──▶ │ /bar │
      └─────────┘          ┗━━━━━━┛     └──────┘
                            │
                            │
                            ▼
                          ┌──────┐
                          │ /baz │
                          └──────┘
      */
      expect(
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set([]),
        modified: new Set(['/bundle']),
        deleted: new Set([]),
      });
    });
  });

  it('should try to transform every file only once', async () => {
    // create a second inverse dependency on /bar to add a cycle.
    Actions.addDependency('/bundle', '/bar');
    files.clear();

    await graph.initialTraverseDependencies(options);

    expect(mockTransform.mock.calls.length).toBe(4);
  });

  it('should try to transform every file only once with multiple entry points', async () => {
    Actions.createFile('/bundle-2');
    Actions.addDependency('/bundle-2', '/foo');
    files.clear();

    // Add a second entry point to the graph.
    graph = new TestGraph({
      entryPoints: new Set(['/bundle', '/bundle-2']),
      transformOptions: options.transformOptions,
    });

    await graph.initialTraverseDependencies(options);

    expect(mockTransform.mock.calls.length).toBe(5);
  });

  it('should create two entries when requiring the same file in different forms', async () => {
    await graph.initialTraverseDependencies(options);

    // We're adding a new reference from bundle to foo.
    Actions.addDependency('/bundle', '/foo', {position: 0, name: 'foo.js'});

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(),
    });

    expect([
      ...nullthrows(graph.dependencies.get(entryModule)).dependencies,
    ]).toEqual([
      [
        expect.any(String),
        {
          absolutePath: '/foo',
          data: {
            data: objectContaining({asyncType: null, locs: []}),
            name: 'foo.js',
          },
        },
      ],
      [
        expect.any(String),
        {
          absolutePath: '/foo',
          data: {
            data: objectContaining({asyncType: null, locs: []}),
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

    graph = new TestGraph({
      entryPoints: new Set(['/bundle', '/bundle-2']),
      transformOptions: options.transformOptions,
    });

    await graph.initialTraverseDependencies(options);

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

      localMockTransform.mockImplementation(
        async (path: string, context: ?RequireContext) => {
          const result = await mockTransform(path, context);

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
        },
      );
    }

    const assertOrder = async function () {
      graph = new TestGraph({
        entryPoints: new Set(['/bundle']),
        transformOptions: options.transformOptions,
      });

      expect(
        Array.from(
          getPaths(
            await graph.initialTraverseDependencies({
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
          {name: 'foo', path: moduleFoo, data: {key: 'foo'}},
          {name: 'bar', path: moduleBar, data: {key: 'bar'}},
        ],
      ],
      [moduleFoo, [{name: 'baz', path: moduleBaz, data: {key: 'baz'}}]],
      [moduleBar, [{name: 'baz', path: moduleBaz, data: {key: 'baz'}}]],
    ]);

    // Test that even when having different modules taking longer, the order
    // remains the same.
    mockTransform.mockClear();
    setMockTransformOrder('/foo', '/bar');
    await assertOrder();
    expect(mockTransform).toHaveBeenCalledWith('/foo', undefined);
    expect(mockTransform).toHaveBeenCalledWith('/bar', undefined);

    mockTransform.mockClear();
    setMockTransformOrder('/bar', '/foo');
    await assertOrder();
    expect(mockTransform).toHaveBeenCalledWith('/bar', undefined);
    expect(mockTransform).toHaveBeenCalledWith('/foo', undefined);
  });

  it('removing a cycle with multiple outgoing edges to the same module', async () => {
    /*
                      ┌─────────────────────────┐
                      │                         ▼
    ┌─────────┐     ┌──────┐     ┌──────┐     ┌──────┐
    │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │ ──▶ │ /baz │
    └─────────┘     └──────┘     └──────┘     └──────┘
                      ▲            │
                      └────────────┘
    */
    Actions.addDependency('/bar', '/foo');
    Actions.addDependency('/bar', '/baz');
    files.clear();

    await graph.initialTraverseDependencies(options);

    /*
                      ┌─────────────────────────┐
                      │                         ▼
    ┌─────────┐   / ┌──────┐     ┌──────┐     ┌──────┐
    │ /bundle │ ┈/▷ │ /foo │ ──▶ │ /bar │ ──▶ │ /baz │
    └─────────┘ /   └──────┘     └──────┘     └──────┘
                      ▲            │
                      └────────────┘
    */
    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar', '/baz']),
    });
  });

  it('deleting a cycle root, then reintroducing the same module, does not corrupt its dependencies', async () => {
    Actions.createFile('/quux');
    Actions.removeDependency('/foo', '/baz');
    Actions.addDependency('/bar', '/foo');
    Actions.addDependency('/bundle', '/baz');
    Actions.addDependency('/foo', '/quux');
    files.clear();

    /*
    ┌─────────┐     ┌──────┐     ┌───────┐     ┌──────┐
    │ /bundle │ ──▶ │ /baz │     │       │ ──▶ │ /bar │
    └─────────┘     └──────┘     │ /foo  │     └──────┘
      │                          │       │       │
      └────────────────────────▶ │       │ ◀─────┘
                                 └───────┘
                                   │
                                   │
                                   ▼
                                 ┌───────┐
                                 │ /quux │
                                 └───────┘
    */
    await graph.initialTraverseDependencies(options);

    // This is a regression test for a bug: Originally `/quux` would get deleted
    // incorrectly as a result of `/foo` temporarily being unreachable (and not
    // itself marked for traversal, which would have "rediscovered" `/quux`).

    // The following exact order of operations reproduced the bug:
    Actions.removeDependency('/bar', '/foo'); // (1)
    // ^ Deletes an inbound edge while there's at least another one remaining,
    //   which marks `/foo` as a possible cycle root.

    Actions.removeDependency('/bundle', '/foo'); // (2)
    // ^ Leaves `/foo` with no inbound edges. With the bug, this would delete
    //   `/foo`'s dependencies immediately but defer freeing `/foo` itself until
    //   the cycle collection pass.

    Actions.addDependency('/baz', '/foo'); // (3)
    // ^ `/foo` has an inbound edge again! If we'd freed `/quux` in (2), it
    //   would now be missing.

    /*
    ┌─────────┐     ┌──────┐ (3) ┌───────┐     ┌──────┐
    │ /bundle │ ──▶ │ /baz │ ━━▶ │       │ ──▶ │ /bar │
    └─────────┘     └──────┘     │ /foo  │     └──────┘
      ┆          /               │       │   \   ┆
      └┈┈┈┈┈┈┈┈┈/┈┈┈┈┈┈┈┈┈┈┈┈┈┈▷ │       │ ◁┈┈\┈┈┘ (1)
               /  (2)            └───────┘     \
                                   │
                                   │
                                   ▼
                                 ┌───────┐
                                 │ /quux │
                                 └───────┘
    */
    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set([]),
      modified: new Set(['/bundle', '/bar', '/baz']),
      deleted: new Set([]),
    });
  });
});

describe('require.context', () => {
  let localOptions;
  beforeEach(() => {
    localOptions = {
      ...options,
      unstable_allowRequireContext: true,
    };
  });

  const ctxParams = {
    recursive: true,
    mode: 'sync',
    filter: {pattern: '.*', flags: ''},
  };

  const ctxResolved = {
    recursive: true,
    mode: 'sync',
    filter: /.*/,
    from: '/ctx',
  };

  const ctxPath = deriveAbsolutePathFromContext('/ctx', ctxParams);

  it('a context module is created when the context exists in the initial graph', async () => {
    // Create a context module
    Actions.addDependency('/bundle', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Compute the initial graph
    files.clear();
    await graph.initialTraverseDependencies(localOptions);

    // The transformer receives the arguments necessary to generate a context module
    expect(mockTransform).toHaveBeenCalledWith(ctxPath, ctxResolved);
    // Ensure the module has been created
    expect(graph.dependencies.get(ctxPath)).not.toBe(undefined);
    // No module at /ctx - that dependency turned into the context module
    expect(graph.dependencies.get('/ctx')).toBe(undefined);

    // We can match paths against the created context
    expect(getMatchingContextModules(graph, '/ctx/matched-file')).toEqual(
      new Set([ctxPath]),
    );
    expect(getMatchingContextModules(graph, '/no-match')).toEqual(new Set());
  });

  it('a context module is created incrementally', async () => {
    // Compute the initial graph
    files.clear();
    await graph.initialTraverseDependencies(localOptions);

    // Create a context module
    Actions.addDependency('/bundle', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Compute the new graph incrementally
    expect(
      getPaths(await graph.traverseDependencies([...files], localOptions)),
    ).toEqual({
      added: new Set([ctxPath]),
      deleted: new Set([]),
      modified: new Set(['/bundle']),
    });

    // The transformer receives the arguments necessary to generate a context module
    expect(mockTransform).toHaveBeenCalledWith(ctxPath, ctxResolved);

    // We can match paths against the created context
    expect(getMatchingContextModules(graph, '/ctx/matched-file')).toEqual(
      new Set([ctxPath]),
    );
  });

  it('context exists in initial traversal and is then removed', async () => {
    // Create a context module
    Actions.addDependency('/bundle', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Compute the initial graph
    files.clear();
    await graph.initialTraverseDependencies(localOptions);

    // Remove the reference to the context module
    Actions.removeDependency('/bundle', '/ctx');

    // Compute the new graph incrementally
    expect(
      getPaths(await graph.traverseDependencies([...files], localOptions)),
    ).toEqual({
      added: new Set([]),
      deleted: new Set([ctxPath]),
      modified: new Set(['/bundle']),
    });

    // We can no longer match against this context because it has been deleted
    expect(getMatchingContextModules(graph, '/ctx/matched-file')).toEqual(
      new Set(),
    );
  });

  it('context + matched file exist in initial traversal and are then removed', async () => {
    // Create a context module
    Actions.addDependency('/bundle', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Create the file matched by the context
    Actions.createFile('/ctx/matched-file');
    // Create a dependency between the context module and the new file, for mockTransform
    Actions.addInferredDependency(ctxPath, '/ctx/matched-file');

    // Compute the initial graph
    files.clear();
    await graph.initialTraverseDependencies(localOptions);

    // Ensure the context module and the matched file are in the graph
    expect(graph.dependencies.get(ctxPath)).not.toBe(undefined);
    expect(graph.dependencies.get('/ctx/matched-file')).not.toBe(undefined);

    // Remove the reference to the context module
    Actions.removeDependency('/bundle', '/ctx');

    // Compute the new graph incrementally
    expect(
      getPaths(await graph.traverseDependencies([...files], localOptions)),
    ).toEqual({
      added: new Set([]),
      deleted: new Set([ctxPath, '/ctx/matched-file']),
      modified: new Set(['/bundle']),
    });

    // We can no longer match against this context because it has been deleted
    expect(getMatchingContextModules(graph, '/ctx/matched-file')).toEqual(
      new Set(),
    );
  });

  it('remove a matched file incrementally from a context', async () => {
    // Create a context module
    Actions.addDependency('/bundle', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Create the file matched by the context
    Actions.createFile('/ctx/matched-file');
    // Create a dependency between the context module and the new file, for mockTransform
    Actions.addInferredDependency(ctxPath, '/ctx/matched-file');

    // Compute the initial graph
    files.clear();
    await graph.initialTraverseDependencies(localOptions);

    // Ensure we recorded an inverse dependency between the matched file and the context module
    expect([
      ...nullthrows(graph.dependencies.get('/ctx/matched-file'))
        .inverseDependencies,
    ]).toEqual([ctxPath]);

    // Delete the matched file
    Actions.deleteFile('/ctx/matched-file', graph);

    // Propagate the deletion to the context module (normally DeltaCalculator's responsibility)
    Actions.removeInferredDependency(ctxPath, '/ctx/matched-file');
    Actions.modifyFile(ctxPath);

    // Compute the new graph incrementally
    mockTransform.mockClear();
    expect(
      getPaths(await graph.traverseDependencies([...files], localOptions)),
    ).toEqual({
      added: new Set([]),
      modified: new Set([ctxPath]),
      deleted: new Set(['/ctx/matched-file']),
    });

    // Ensure the incremental traversal re-transformed the context module
    expect(mockTransform).toHaveBeenCalledWith(ctxPath, ctxResolved);
  });

  it('modify a matched file incrementally', async () => {
    // Create a context module
    Actions.addDependency('/bundle', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Create the file matched by the context
    Actions.createFile('/ctx/matched-file');
    // Create a dependency between the context module and the new file, for mockTransform
    Actions.addInferredDependency(ctxPath, '/ctx/matched-file');

    // Compute the initial graph
    files.clear();
    await graph.initialTraverseDependencies(localOptions);

    // Modify the matched file
    Actions.modifyFile('/ctx/matched-file');

    // We do not propagate the modification to the context module. (See DeltaCalculator)

    // Compute the new graph incrementally
    mockTransform.mockClear();
    expect(
      getPaths(await graph.traverseDependencies([...files], localOptions)),
    ).toEqual({
      added: new Set([]),
      modified: new Set(['/ctx/matched-file']),
      deleted: new Set([]),
    });

    // Ensure the incremental traversal did not re-transform the context module
    expect(mockTransform).not.toHaveBeenCalledWith(ctxPath, ctxResolved);
  });

  it('add a matched file incrementally to a context', async () => {
    // Create a context module
    Actions.addDependency('/bundle', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Compute the initial graph
    files.clear();
    await graph.initialTraverseDependencies(localOptions);

    // Create the file matched by the context
    Actions.createFile('/ctx/matched-file');
    // Create a dependency between the context module and the new file, for mockTransform
    Actions.addInferredDependency(ctxPath, '/ctx/matched-file');
    // Propagate the addition to the context module (normally DeltaCalculator's responsibility)
    graph.markModifiedContextModules('/ctx/matched-file', files);

    // Compute the new graph incrementally
    mockTransform.mockClear();
    expect(
      getPaths(await graph.traverseDependencies([...files], localOptions)),
    ).toEqual({
      added: new Set(['/ctx/matched-file']),
      modified: new Set([ctxPath]),
      deleted: new Set([]),
    });

    // Ensure the incremental traversal re-transformed the context module
    expect(mockTransform).toHaveBeenCalledWith(ctxPath, ctxResolved);
  });

  it('add a matched file incrementally to a context with two references', async () => {
    // Create a context module
    Actions.addDependency('/bundle', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Create another reference to the same context module
    Actions.addDependency('/foo', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Compute the initial graph
    files.clear();
    await graph.initialTraverseDependencies(localOptions);

    // Create the file matched by the context
    Actions.createFile('/ctx/matched-file');
    Actions.addInferredDependency(ctxPath, '/ctx/matched-file');
    // Propagate the addition to the context module (normally DeltaCalculator's responsibility)
    graph.markModifiedContextModules('/ctx/matched-file', files);

    // Compute the new graph incrementally
    mockTransform.mockClear();
    expect(
      getPaths(await graph.traverseDependencies([...files], localOptions)),
    ).toEqual({
      added: new Set(['/ctx/matched-file']),
      modified: new Set([ctxPath]),
      deleted: new Set([]),
    });

    // Ensure the incremental traversal re-transformed the context module
    expect(mockTransform).toHaveBeenCalledWith(ctxPath, ctxResolved);
  });

  it('remove only one of two references to a context module', async () => {
    // Create a context module
    Actions.addDependency('/bundle', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Create another reference to the same context module
    Actions.addDependency('/foo', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Compute the initial graph
    files.clear();
    await graph.initialTraverseDependencies(localOptions);

    // Remove one reference
    Actions.removeDependency('/bundle', '/ctx');

    // Compute the new graph incrementally
    mockTransform.mockClear();
    expect(
      getPaths(await graph.traverseDependencies([...files], localOptions)),
    ).toEqual({
      added: new Set([]),
      modified: new Set(['/bundle']),
      deleted: new Set([]),
    });

    // Ensure the incremental traversal did not re-transform the context module
    expect(mockTransform).not.toHaveBeenCalledWith(ctxPath, ctxResolved);

    // We can still match against this context because it has not been deleted
    expect(getMatchingContextModules(graph, '/ctx/matched-file')).toEqual(
      new Set([ctxPath]),
    );
  });

  describe('when two distinct contexts match the same file', () => {
    const narrowCtxParams = {
      recursive: true,
      mode: 'sync',
      filter: {pattern: '\\./narrow/.*', flags: ''},
    };

    const narrowCtxResolved = {
      recursive: true,
      mode: 'sync',
      filter: /\.\/narrow\/.*/,
      from: '/ctx',
    };

    const narrowCtxPath = deriveAbsolutePathFromContext(
      '/ctx',
      narrowCtxParams,
    );

    it('creates two context modules in the initial traversal', async () => {
      // Create a context module
      Actions.addDependency('/bundle', '/ctx', {
        data: {
          contextParams: ctxParams,
        },
      });

      // Create a different context module with the same base path and origin module
      Actions.addDependency('/bundle', '/ctx', {
        data: {
          contextParams: narrowCtxParams,
          key: '/ctx2',
        },
      });

      // Compute the initial graph
      files.clear();
      await graph.initialTraverseDependencies(localOptions);

      // The transformer receives the arguments necessary to generate each context module
      expect(mockTransform).toHaveBeenCalledWith(ctxPath, ctxResolved);
      expect(mockTransform).toHaveBeenCalledWith(
        narrowCtxPath,
        narrowCtxResolved,
      );
      // Ensure the modules have been created
      expect(graph.dependencies.get(ctxPath)).not.toBe(undefined);
      expect(graph.dependencies.get(narrowCtxPath)).not.toBe(undefined);
      // No module at /ctx or /ctx/narrow - those dependencies turned into the context modules
      expect(graph.dependencies.get('/ctx')).toBe(undefined);
      expect(graph.dependencies.get('/ctx/narrow')).toBe(undefined);
      // Not conflating the key with the virtual path
      expect(graph.dependencies.get('/ctx2')).toBe(undefined);

      // We can match paths against the contexts
      expect(getMatchingContextModules(graph, '/ctx/matched-file')).toEqual(
        new Set([ctxPath]),
      );
      expect(
        getMatchingContextModules(graph, '/ctx/narrow/matched-file'),
      ).toEqual(new Set([ctxPath, narrowCtxPath]));
    });

    it('add a file matched by both contexts', async () => {
      // Create a context module
      Actions.addDependency('/bundle', '/ctx', {
        data: {
          contextParams: ctxParams,
        },
      });

      // Create a different context module with the same base path and origin module
      Actions.addDependency('/bundle', '/ctx', {
        data: {
          contextParams: narrowCtxParams,
          key: '/ctx2',
        },
      });

      // Compute the initial graph
      files.clear();
      await graph.initialTraverseDependencies(localOptions);

      // Create the file matched by the contexts
      Actions.createFile('/ctx/narrow/matched-file');
      Actions.addInferredDependency(ctxPath, '/ctx/narrow/matched-file');
      Actions.addInferredDependency(narrowCtxPath, '/ctx/narrow/matched-file');
      // Propagate the addition to the context modules (normally DeltaCalculator's responsibility)
      graph.markModifiedContextModules('/ctx/narrow/matched-file', files);

      // Compute the new graph incrementally
      expect(
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set(['/ctx/narrow/matched-file']),
        modified: new Set([ctxPath, narrowCtxPath]),
        deleted: new Set([]),
      });
    });

    it('deleting one context does not delete a file matched by both contexts', async () => {
      // Create a context module
      Actions.addDependency('/bundle', '/ctx', {
        data: {
          contextParams: ctxParams,
        },
      });

      // Create a different context module with the same base path and origin module
      Actions.addDependency('/bundle', '/ctx', {
        data: {
          contextParams: narrowCtxParams,
          key: '/ctx2',
        },
      });

      // Create the file matched by the contexts
      Actions.createFile('/ctx/narrow/matched-file');
      Actions.addInferredDependency(ctxPath, '/ctx/narrow/matched-file');
      Actions.addInferredDependency(narrowCtxPath, '/ctx/narrow/matched-file');

      // Compute the initial graph
      files.clear();
      await graph.initialTraverseDependencies(localOptions);

      // Remove the reference to one of the context modules
      Actions.removeDependency('/bundle', '/ctx');

      // Compute the new graph incrementally
      expect(
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set([]),
        modified: new Set(['/bundle']),
        deleted: new Set([ctxPath]),
      });
    });

    it('edge case: changing context params incrementally under the same key', async () => {
      // Create a context module
      Actions.addDependency('/bundle', '/ctx', {
        data: {
          contextParams: ctxParams,
          key: '/ctx',
        },
      });
      // Create the file matched by the contexts
      Actions.createFile('/ctx/narrow/matched-file');
      Actions.addInferredDependency(ctxPath, '/ctx/narrow/matched-file');

      // Compute the initial graph
      files.clear();
      await graph.initialTraverseDependencies(localOptions);

      // Remove the reference to one of the context modules
      Actions.removeDependency('/bundle', '/ctx');
      // Replace it with a context with different params
      Actions.addDependency('/bundle', '/ctx', {
        data: {
          contextParams: narrowCtxParams,
          key: '/ctx',
        },
      });
      Actions.addInferredDependency(narrowCtxPath, '/ctx/narrow/matched-file');

      // Compute the new graph incrementally
      expect(
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set([narrowCtxPath]),
        modified: new Set(['/bundle']),
        deleted: new Set([ctxPath]),
      });

      // We can match paths against the updated context
      expect(getMatchingContextModules(graph, '/ctx/matched-file')).toEqual(
        new Set(),
      );
      expect(
        getMatchingContextModules(graph, '/ctx/narrow/matched-file'),
      ).toEqual(new Set([narrowCtxPath]));
    });
  });

  it('edge case: replacing a generated context file with a file that happens to have the same name and key', async () => {
    // Create a context module
    Actions.addDependency('/bundle', '/ctx', {
      data: {
        contextParams: ctxParams,
        key: '/ctx',
      },
    });
    // Create the file matched by the context
    Actions.createFile('/ctx/matched-file');
    Actions.addInferredDependency(ctxPath, '/ctx/matched-file');

    // Compute the initial graph
    files.clear();
    await graph.initialTraverseDependencies(localOptions);

    // Remove the reference to the context module
    Actions.removeDependency('/bundle', '/ctx');
    // Create a real file that collides with the context module's generated path
    Actions.createFile(ctxPath);
    Actions.addDependency('/bundle', ctxPath, {data: {key: '/ctx'}});
    Actions.createFile('/other-file');
    Actions.removeInferredDependency(ctxPath, '/ctx/matched-file');
    Actions.addDependency(ctxPath, '/other-file');

    // Compute the new graph incrementally
    expect(
      getPaths(await graph.traverseDependencies([...files], localOptions)),
    ).toEqual({
      added: new Set(['/other-file']),
      modified: new Set(['/bundle', ctxPath]),
      deleted: new Set(['/ctx/matched-file']),
    });

    // We can no longer match paths against the context because it has been deleted
    expect(getMatchingContextModules(graph, '/ctx/matched-file')).toEqual(
      new Set(),
    );
  });
});

describe('reorderGraph', () => {
  it('should reorder any unordered graph in DFS order', async () => {
    const dep = (path: string): Dependency => ({
      absolutePath: path,
      data: {
        data: {
          asyncType: null,
          locs: [],
          key: path.substr(1),
        },
        name: path.substr(1),
      },
    });

    const mod = (moduleData: {
      dependencies: Map<string, Dependency>,
      path: string,
    }): Module<MixedOutput> => ({
      ...moduleData,
      output: [],
      getSource: () => Buffer.from('// source'),
      // NOTE: inverseDependencies is traversal state/output, not input, so we
      // don't pre-populate it.
      inverseDependencies: new CountingSet(),
    });

    const graph = new TestGraph({
      entryPoints: new Set(['/a', '/b']),
      transformOptions: options.transformOptions,
    });
    // prettier-ignore
    const deps = [
      ['/2', mod({path: '/2', dependencies: new Map()})],
      ['/0', mod({path: '/0', dependencies: new Map([['/1', dep('/1')], ['/2', dep('/2')]])})],
      ['/1', mod({path: '/1', dependencies: new Map([['/2', dep('/2')]])})],
      ['/3', mod({path: '/3', dependencies: new Map([])})],
      ['/b', mod({path: '/b', dependencies: new Map([['/3', dep('/3')]])})],
      ['/a', mod({path: '/a', dependencies: new Map([['/0', dep('/0')]])})],
    ];
    for (const [key, dep] of deps) {
      graph.dependencies.set(key, dep);
    }

    graph.reorderGraph({shallow: false});

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
    const all = new Set<string>();
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
    /* $FlowFixMe[missing-this-annot] The 'this' type annotation(s) required by
     * Flow's LTI update could not be added via codemod */
    return async function (path: string, context: ?RequireContext) {
      const result = await mockTransform.call(this, path, context);
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

    localGraph = new TestGraph({
      entryPoints: new Set(['/bundle-o']),
      transformOptions: options.transformOptions,
    });

    Actions.deleteFile('/optional-b', localGraph);
  });

  it('missing optional dependency will be skipped', async () => {
    localOptions = {
      ...options,
      transform: createMockTransform(),
    };

    const result = await localGraph.initialTraverseDependencies(localOptions);

    const dependencies = result.added;
    assertResults(dependencies, ['optional-b']);
  });
  it('missing non-optional dependency will throw', async () => {
    localOptions = {
      ...options,
      transform: createMockTransform(['optional-b']),
    };
    await expect(
      localGraph.initialTraverseDependencies(localOptions),
    ).rejects.toThrow();
  });
});

describe('parallel edges', () => {
  it('add twice w/ same name, build and remove once', async () => {
    // Create a second edge between /foo and /bar.
    Actions.addDependency('/foo', '/bar', {
      data: {
        key: 'bar-second-key',
      },
    });

    await graph.initialTraverseDependencies(options);

    // Remove one of the edges between /foo and /bar (arbitrarily)
    Actions.removeDependency('/foo', '/bar');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/foo']),
      deleted: new Set(),
    });
  });

  it('add twice w/ same name, build and remove twice', async () => {
    // Create a second edge between /foo and /bar.
    Actions.addDependency('/foo', '/bar', {
      data: {
        key: 'bar-second-key',
      },
    });

    await graph.initialTraverseDependencies(options);

    // Remove both edges between /foo and /bar
    Actions.removeDependency('/foo', '/bar');
    Actions.removeDependency('/foo', '/bar');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/foo']),
      deleted: new Set(['/bar']),
    });
  });

  it('add twice w/ different names, build and remove once', async () => {
    // Create a second edge between /foo and /bar, with a different `name`.
    Actions.addDependency('/foo', '/bar', {name: 'bar-second'});

    await graph.initialTraverseDependencies(options);

    // Remove one of the edges between /foo and /bar (arbitrarily)
    Actions.removeDependency('/foo', '/bar');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/foo']),
      deleted: new Set(),
    });
  });

  it('add twice w/ different names, build and remove twice', async () => {
    // Create a second edge between /foo and /bar, with a different `name`.
    Actions.addDependency('/foo', '/bar', {name: 'bar-second'});

    await graph.initialTraverseDependencies(options);

    // Remove both edges between /foo and /bar
    Actions.removeDependency('/foo', '/bar');
    Actions.removeDependency('/foo', '/bar');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/foo']),
      deleted: new Set(['/bar']),
    });
  });
});
