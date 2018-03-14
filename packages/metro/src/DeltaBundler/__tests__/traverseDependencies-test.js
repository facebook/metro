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

const {
  initialTraverseDependencies,
  traverseDependencies,
} = require('../traverseDependencies');

let dependencyGraph;
let mockedDependencies;
let mockedDependencyTree;
let files = new Set();

let entryModule;
let moduleFoo;
let moduleBar;
let moduleBaz;

const Actions = {
  modifyFile(path) {
    if (mockedDependencyTree.get(path)) {
      files.add(path);
    }
  },

  moveFile(from, to) {
    const module = Actions.createFile(to);
    Actions.deleteFile(from);

    return module;
  },

  deleteFile(path) {
    const dependency = dependencyGraph.getModuleForPath(path);

    if (dependency) {
      mockedDependencies.delete(dependency);
    }
  },

  createFile(path) {
    const module = createModule({
      path,
      name: path.replace('/', ''),
    });
    mockedDependencies.add(module);
    mockedDependencyTree.set(path, []);

    return module;
  },

  addDependency(path, dependencyPath, position, name = null) {
    let dependency = dependencyGraph.getModuleForPath(dependencyPath);
    if (!dependency) {
      dependency = Actions.createFile(dependencyPath);
    }

    const deps = mockedDependencyTree.get(path);
    name = name || dependency.name;

    if (position == null) {
      deps.push({name, dependency});
    } else {
      deps.splice(position, 0, {name, dependency});
    }

    mockedDependencyTree.set(path, deps);
    mockedDependencies.add(dependency);

    files.add(path);
  },

  removeDependency(path, dependencyPath) {
    const dep = dependencyGraph.getModuleForPath(dependencyPath);
    const deps = mockedDependencyTree.get(path);

    const index = deps.findIndex(({dependency}) => dep === dependency);
    if (index !== -1) {
      deps.splice(index, 1);
      mockedDependencyTree.set(path, deps);
    }

    files.add(path);
  },
};

function deferred(value) {
  let resolve;
  const promise = new Promise(res => (resolve = res));

  return {promise, resolve: () => resolve(value)};
}

function createModule({path, name}) {
  return {
    path,
    name,
    isAsset() {
      return false;
    },
    isPolyfill() {
      return false;
    },
    async read() {
      const deps = mockedDependencyTree.get(path);
      const dependencies = deps ? deps.map(dep => dep.name) : [];

      return {
        code: '// code',
        map: [],
        source: '// source',
        dependencies,
      };
    },
  };
}

function getPaths({added, deleted}) {
  const addedPaths = [...added.values()].map(edge => edge.path);

  return {
    added: new Set(addedPaths),
    deleted,
  };
}

beforeEach(async () => {
  mockedDependencies = new Set();
  mockedDependencyTree = new Map();

  dependencyGraph = {
    getAbsolutePath(path) {
      return '/' + path;
    },
    getModuleForPath(path) {
      return Array.from(mockedDependencies).find(dep => dep.path === path);
    },
    resolveDependency(module, relativePath) {
      const deps = mockedDependencyTree.get(module.path);
      const {dependency} = deps.filter(dep => dep.name === relativePath)[0];

      if (!mockedDependencies.has(dependency)) {
        throw new Error(
          `Dependency not found: ${module.path}->${relativePath}`,
        );
      }
      return dependency;
    },
  };

  // Generate the initial dependency graph.
  entryModule = Actions.createFile('/bundle');
  moduleFoo = Actions.createFile('/foo');
  moduleBar = Actions.createFile('/bar');
  moduleBaz = Actions.createFile('/baz');

  Actions.addDependency('/bundle', '/foo');
  Actions.addDependency('/foo', '/bar');
  Actions.addDependency('/foo', '/baz');

  files = new Set();
});

it('should do the initial traversal correctly', async () => {
  const edges = new Map();
  const result = await initialTraverseDependencies(
    '/bundle',
    dependencyGraph,
    {},
    edges,
  );

  expect(getPaths(result)).toEqual({
    added: new Set(['/bundle', '/foo', '/bar', '/baz']),
    deleted: new Set(),
  });

  expect(edges).toMatchSnapshot();
});

it('should return an empty result when there are no changes', async () => {
  const edges = new Map();
  await initialTraverseDependencies('/bundle', dependencyGraph, {}, edges);

  expect(
    getPaths(
      await traverseDependencies(['/bundle'], dependencyGraph, {}, edges),
    ),
  ).toEqual({
    added: new Set(['/bundle']),
    deleted: new Set(),
  });
});

it('should return a removed dependency', async () => {
  const edges = new Map();
  await initialTraverseDependencies('/bundle', dependencyGraph, {}, edges);

  Actions.removeDependency('/foo', '/bar');

  expect(
    getPaths(
      await traverseDependencies([...files], dependencyGraph, {}, edges),
    ),
  ).toEqual({
    added: new Set(['/foo']),
    deleted: new Set(['/bar']),
  });
});

it('should return added/removed dependencies', async () => {
  const edges = new Map();
  await initialTraverseDependencies('/bundle', dependencyGraph, {}, edges);

  Actions.addDependency('/foo', '/qux');
  Actions.removeDependency('/foo', '/bar');
  Actions.removeDependency('/foo', '/baz');

  expect(
    getPaths(
      await traverseDependencies([...files], dependencyGraph, {}, edges),
    ),
  ).toEqual({
    added: new Set(['/foo', '/qux']),
    deleted: new Set(['/bar', '/baz']),
  });
});

it('should return added modules before the modified ones', async () => {
  const edges = new Map();
  await initialTraverseDependencies('/bundle', dependencyGraph, {}, edges);

  Actions.addDependency('/foo', '/qux');
  Actions.modifyFile('/bar');
  Actions.modifyFile('/baz');

  // extect.toEqual() does not check order of Sets/Maps, so we need to convert
  // it to an array.
  expect([
    ...getPaths(
      await traverseDependencies([...files], dependencyGraph, {}, edges),
    ).added,
  ]).toEqual(['/qux', '/foo', '/bar', '/baz']);
});

it('should retry to traverse the dependencies as it was after getting an error', async () => {
  const edges = new Map();
  await initialTraverseDependencies('/bundle', dependencyGraph, {}, edges);

  Actions.deleteFile(moduleBar.path);

  await expect(
    traverseDependencies(['/foo'], dependencyGraph, {}, edges),
  ).rejects.toBeInstanceOf(Error);

  // Second time that the traversal of dependencies we still have to throw an
  // error (no matter if no file has been changed).
  await expect(
    traverseDependencies(['/foo'], dependencyGraph, {}, edges),
  ).rejects.toBeInstanceOf(Error);
});

describe('edge cases', () => {
  it('should handle renames correctly', async () => {
    const edges = new Map();
    await initialTraverseDependencies('/bundle', dependencyGraph, {}, edges);

    Actions.removeDependency('/foo', '/baz');
    Actions.moveFile('/baz', '/qux');
    Actions.addDependency('/foo', '/qux');

    expect(
      getPaths(
        await traverseDependencies([...files], dependencyGraph, {}, edges),
      ),
    ).toEqual({
      added: new Set(['/foo', '/qux']),
      deleted: new Set(['/baz']),
    });
  });

  it('should not try to remove wrong dependencies when renaming files', async () => {
    const edges = new Map();
    await initialTraverseDependencies('/bundle', dependencyGraph, {}, edges);

    // Rename /foo to /foo-renamed, but keeping all its dependencies.
    Actions.addDependency('/bundle', '/foo-renamed');
    Actions.removeDependency('/bundle', '/foo');

    Actions.moveFile('/foo', '/foo-renamed');
    Actions.addDependency('/foo-renamed', '/bar');
    Actions.addDependency('/foo-renamed', '/baz');

    expect(
      getPaths(
        await traverseDependencies([...files], dependencyGraph, {}, edges),
      ),
    ).toEqual({
      added: new Set(['/bundle', '/foo-renamed']),
      deleted: new Set(['/foo']),
    });
  });

  it('modify a file and delete it afterwards', async () => {
    const edges = new Map();
    await initialTraverseDependencies('/bundle', dependencyGraph, {}, edges);

    Actions.modifyFile('/baz');
    Actions.removeDependency('/foo', '/baz');

    expect(
      getPaths(
        await traverseDependencies([...files], dependencyGraph, {}, edges),
      ),
    ).toEqual({
      added: new Set(['/foo']),
      deleted: new Set(['/baz']),
    });
  });

  it('move a file to a different folder', async () => {
    const edges = new Map();
    await initialTraverseDependencies('/bundle', dependencyGraph, {}, edges);

    Actions.addDependency('/foo', '/baz-moved');
    Actions.removeDependency('/foo', '/baz');

    expect(
      getPaths(
        await traverseDependencies([...files], dependencyGraph, {}, edges),
      ),
    ).toEqual({
      added: new Set(['/foo', '/baz-moved']),
      deleted: new Set(['/baz']),
    });
  });

  it('maintain the order of module dependencies consistent', async () => {
    const edges = new Map();
    await initialTraverseDependencies('/bundle', dependencyGraph, {}, edges);

    Actions.addDependency('/foo', '/qux', 0);

    expect(
      getPaths(
        await traverseDependencies([...files], dependencyGraph, {}, edges),
      ),
    ).toEqual({
      added: new Set(['/foo', '/qux']),
      deleted: new Set(),
    });

    expect([...edges.get(moduleFoo.path).dependencies]).toEqual([
      ['qux', '/qux'],
      ['bar', '/bar'],
      ['baz', '/baz'],
    ]);
  });

  it('should create two entries when requiring the same file in different forms', async () => {
    const edges = new Map();
    await initialTraverseDependencies('/bundle', dependencyGraph, {}, edges);

    // We're adding a new reference from bundle to foo.
    Actions.addDependency('/bundle', '/foo', 0, 'foo.js');

    expect(
      getPaths(
        await traverseDependencies([...files], dependencyGraph, {}, edges),
      ),
    ).toEqual({
      added: new Set(['/bundle']),
      deleted: new Set(),
    });

    expect([...edges.get(entryModule.path).dependencies]).toEqual([
      ['foo.js', '/foo'],
      ['foo', '/foo'],
    ]);
  });

  it('should traverse the dependency tree in a deterministic order', async () => {
    // Mocks the shallow dependency call, always resolving the module in
    // `slowPath` after the module in `fastPath`.
    function mockShallowDependencies(slowPath, fastPath) {
      let deferredSlow;
      let fastResolved = false;

      dependencyGraph.getShallowDependencies = async path => {
        const deps = mockedDependencyTree.get(path);

        const result = deps
          ? await Promise.all(deps.map(dep => dep.getName()))
          : [];

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
      };
    }

    async function assertOrder() {
      expect(
        Array.from(
          getPaths(
            await initialTraverseDependencies(
              '/bundle',
              dependencyGraph,
              {},
              new Map(),
            ),
          ).added,
        ),
      ).toEqual(['/bundle', '/foo', '/baz', '/bar']);
    }

    // Create a dependency tree where moduleBaz has two inverse dependencies.
    mockedDependencyTree = new Map([
      [
        entryModule.path,
        [
          {name: 'foo', dependency: moduleFoo},
          {name: 'bar', dependency: moduleBar},
        ],
      ],
      [moduleFoo.path, [{name: 'baz', dependency: moduleBaz}]],
      [moduleBar.path, [{name: 'baz', dependency: moduleBaz}]],
    ]);

    // Test that even when having different modules taking longer, the order
    // remains the same.
    mockShallowDependencies('/foo', '/bar');
    await assertOrder();

    mockShallowDependencies('/bar', '/foo');
    await assertOrder();
  });

  it('should simplify inlineRequires transform option', async () => {
    jest.spyOn(entryModule, 'read');
    jest.spyOn(moduleFoo, 'read');
    jest.spyOn(moduleBar, 'read');
    jest.spyOn(moduleBaz, 'read');

    const edges = new Map();
    const transformOptions = {
      inlineRequires: {
        blacklist: {
          '/baz': true,
        },
      },
    };

    await initialTraverseDependencies(
      '/bundle',
      dependencyGraph,
      transformOptions,
      edges,
    );

    expect(entryModule.read).toHaveBeenCalledWith({inlineRequires: true});
    expect(moduleFoo.read).toHaveBeenCalledWith({inlineRequires: true});
    expect(moduleBar.read).toHaveBeenCalledWith({inlineRequires: true});
    expect(moduleBaz.read).toHaveBeenCalledWith({inlineRequires: false});

    moduleFoo.read.mockClear();

    await traverseDependencies(
      ['/foo'],
      dependencyGraph,
      transformOptions,
      edges,
    );

    expect(moduleFoo.read).toHaveBeenCalledWith({inlineRequires: true});
  });
});
