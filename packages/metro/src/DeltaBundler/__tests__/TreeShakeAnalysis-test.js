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

'use strict';

import type {
  ImportBinding,
  ReexportBinding,
} from '../../ModuleGraph/worker/collectDependencies';
import type {ReadonlySourceLocation} from '../../shared/types';
import type {UsedExports, UsedExportsMap} from '../TreeShakeAnalysis';
import type {
  Dependency,
  Module,
  ReadOnlyGraph,
  ResolvedDependency,
} from '../types';

import CountingSet from '../../lib/CountingSet';
import {
  analyzeAndEliminate,
  computeReexportDemand,
  getEliminatedReexportSources,
} from '../TreeShakeAnalysis';

type ExportBinding =
  | {type: 'named', name: string, localName: string}
  | {type: 'default', localName: ?string}
  | {type: 'reExportNamed', name: string, as: string, source: string}
  | {type: 'reExportAll', source: string}
  | {type: 'reExportNamespace', as: string, source: string};

type DependencyDataForTest = {
  asyncType: null,
  isESMImport: boolean,
  key: string,
  locs: Array<ReadonlySourceLocation>,
  importBindings?: ReadonlyArray<ImportBinding>,
  reexportBindings?: ReadonlyArray<ReexportBinding>,
};

function usedNamed(names: Array<string>): UsedExports {
  const used: UsedExports = {type: 'named', names: new Set(names)};
  return used;
}

function usedNone(): UsedExports {
  const used: UsedExports = {type: 'none'};
  return used;
}

function makeResolvedDependency({
  name,
  absolutePath,
  importBindings,
  isESMImport = true,
  reexportBindings,
}: {
  name: string,
  absolutePath: string,
  importBindings?: ReadonlyArray<ImportBinding>,
  isESMImport?: boolean,
  reexportBindings?: ReadonlyArray<ReexportBinding>,
}): ResolvedDependency {
  const data: DependencyDataForTest = {
    asyncType: null,
    isESMImport,
    key: name,
    locs: [],
  };
  if (importBindings != null) {
    data.importBindings = importBindings;
  }
  if (reexportBindings != null) {
    data.reexportBindings = reexportBindings;
  }

  return {
    absolutePath,
    data: {
      name,
      data,
    },
  };
}

function makeGraph({
  entryPoints,
  modules,
}: {
  entryPoints: Array<string>,
  modules: Array<[string, Module<>]>,
}): ReadOnlyGraph<> {
  return {
    dependencies: new Map(modules),
    entryPoints: new Set(entryPoints),
    transformOptions: {
      dev: false,
      minify: false,
      platform: null,
      type: 'module',
      unstable_transformProfile: 'default',
    },
  };
}

function makeResolvedReexportAllDependency(
  name: string,
  absolutePath: string,
): ResolvedDependency {
  const reexportBindings: ReadonlyArray<ReexportBinding> = [
    {type: 'reExportAll'},
  ];
  const data: DependencyDataForTest = {
    asyncType: null,
    isESMImport: true,
    key: name,
    locs: [],
    reexportBindings,
  };

  return {
    absolutePath,
    data: {
      name,
      data,
    },
  };
}

function makeModule(
  path: string,
  {
    deps = [],
    directExportNames = [],
    exports = [],
    inverseDeps = [],
    isESModule = true,
  }: {
    deps?: Array<[string, Dependency]>,
    directExportNames?: Array<string>,
    exports?: Array<ExportBinding>,
    inverseDeps?: Array<string>,
    isESModule?: boolean,
  } = {},
): Module<> {
  return {
    dependencies: new Map(deps),
    inverseDependencies: new CountingSet(inverseDeps),
    output: [],
    path,
    getSource: () => Buffer.from(''),
    moduleSyntax: {
      directExportNames: new Set(directExportNames),
      exports,
      isESModule,
      parserPlugins: ['flow'],
    },
  };
}

describe('analyzeAndEliminate', () => {
  test('marks used names from import bindings', () => {
    const entryPath = '/entry.js';
    const depPath = '/dep.js';
    const graph = makeGraph({
      entryPoints: [entryPath],
      modules: [
        [
          entryPath,
          makeModule(entryPath, {
            deps: [
              [
                'dep',
                makeResolvedDependency({
                  absolutePath: depPath,
                  importBindings: [{name: 'foo', type: 'named'}],
                  name: './dep',
                }),
              ],
            ],
          }),
        ],
        [depPath, makeModule(depPath, {directExportNames: ['foo']})],
      ],
    });

    const {eliminable, usedExports} = analyzeAndEliminate(graph, () => false);

    expect(usedExports.get(depPath)).toEqual({
      names: new Set(['foo']),
      type: 'named',
    });
    expect(eliminable.has(depPath)).toBe(false);
  });

  test('keeps side-effect-only imports alive', () => {
    const entryPath = '/entry.js';
    const depPath = '/dep.js';
    const graph = makeGraph({
      entryPoints: [entryPath],
      modules: [
        [
          entryPath,
          makeModule(entryPath, {
            deps: [
              [
                'dep',
                makeResolvedDependency({
                  absolutePath: depPath,
                  importBindings: [{type: 'sideEffectOnly'}],
                  name: './dep',
                }),
              ],
            ],
          }),
        ],
        [depPath, makeModule(depPath, {inverseDeps: [entryPath]})],
      ],
    });

    const {eliminable, usedExports} = analyzeAndEliminate(graph, () => false);

    expect(usedExports.get(depPath)).toEqual({type: 'none'});
    expect(eliminable.has(depPath)).toBe(false);
  });

  test('eliminates unused side-effect-free ESM modules', () => {
    const entryPath = '/entry.js';
    const deadPath = '/dead.js';
    const graph = makeGraph({
      entryPoints: [entryPath],
      modules: [
        [entryPath, makeModule(entryPath)],
        [deadPath, makeModule(deadPath)],
      ],
    });

    const {eliminable} = analyzeAndEliminate(graph, () => false);
    expect(eliminable.has(deadPath)).toBe(true);
  });

  test('does not eliminate modules that have side effects', () => {
    const entryPath = '/entry.js';
    const sideEffectPath = '/side-effect.js';
    const graph = makeGraph({
      entryPoints: [entryPath],
      modules: [
        [entryPath, makeModule(entryPath)],
        [sideEffectPath, makeModule(sideEffectPath)],
      ],
    });

    const {eliminable} = analyzeAndEliminate(
      graph,
      modulePath => modulePath === sideEffectPath,
    );
    expect(eliminable.has(sideEffectPath)).toBe(false);
  });

  test('sideEffects=true keeps an otherwise-dead module', () => {
    const entryPath = '/entry.js';
    const modulePath = '/pkg/with-effects.js';
    const graph = makeGraph({
      entryPoints: [entryPath],
      modules: [
        [entryPath, makeModule(entryPath)],
        [modulePath, makeModule(modulePath)],
      ],
    });

    const sideEffectsByPath = new Map([[modulePath, true]]);
    const {eliminable} = analyzeAndEliminate(
      graph,
      modulePathArg => sideEffectsByPath.get(modulePathArg) ?? true,
    );

    expect(eliminable.has(modulePath)).toBe(false);
  });

  test('sideEffects=false allows eliminating an otherwise-dead module', () => {
    const entryPath = '/entry.js';
    const modulePath = '/pkg/no-effects.js';
    const graph = makeGraph({
      entryPoints: [entryPath],
      modules: [
        [entryPath, makeModule(entryPath)],
        [modulePath, makeModule(modulePath)],
      ],
    });

    const sideEffectsByPath = new Map([[modulePath, false]]);
    const {eliminable} = analyzeAndEliminate(
      graph,
      modulePathArg => sideEffectsByPath.get(modulePathArg) ?? true,
    );

    expect(eliminable.has(modulePath)).toBe(true);
  });

  test('missing sideEffects metadata is conservative (module kept)', () => {
    const entryPath = '/entry.js';
    const modulePath = '/pkg/unknown.js';
    const graph = makeGraph({
      entryPoints: [entryPath],
      modules: [
        [entryPath, makeModule(entryPath)],
        [modulePath, makeModule(modulePath)],
      ],
    });

    const {eliminable} = analyzeAndEliminate(graph, () => true);

    expect(eliminable.has(modulePath)).toBe(false);
  });

  test('escalates CJS require without bindings to all for ESM target', () => {
    const entryPath = '/entry.js';
    const depPath = '/dep.js';
    const graph = makeGraph({
      entryPoints: [entryPath],
      modules: [
        [
          entryPath,
          makeModule(entryPath, {
            deps: [
              [
                'dep',
                makeResolvedDependency({
                  absolutePath: depPath,
                  isESMImport: false,
                  name: './dep',
                }),
              ],
            ],
          }),
        ],
        [depPath, makeModule(depPath, {directExportNames: ['foo']})],
      ],
    });

    const {usedExports} = analyzeAndEliminate(graph, () => false);
    expect(usedExports.get(depPath)).toEqual({type: 'all'});
  });

  test('propagates re-export usage through barrel modules', () => {
    const entryPath = '/entry.js';
    const barrelPath = '/barrel.js';
    const sourcePath = '/source.js';
    const graph = makeGraph({
      entryPoints: [entryPath],
      modules: [
        [
          entryPath,
          makeModule(entryPath, {
            deps: [
              [
                'barrel',
                makeResolvedDependency({
                  absolutePath: barrelPath,
                  importBindings: [{name: 'bar', type: 'named'}],
                  name: './barrel',
                }),
              ],
            ],
          }),
        ],
        [
          barrelPath,
          makeModule(barrelPath, {
            deps: [
              [
                'source',
                makeResolvedDependency({
                  absolutePath: sourcePath,
                  name: './source',
                  reexportBindings: [
                    {as: 'bar', name: 'foo', type: 'reExportNamed'},
                  ],
                }),
              ],
            ],
          }),
        ],
        [sourcePath, makeModule(sourcePath, {directExportNames: ['foo']})],
      ],
    });

    const {usedExports} = analyzeAndEliminate(graph, () => false);
    expect(usedExports.get(sourcePath)).toEqual({
      names: new Set(['foo']),
      type: 'named',
    });
  });
});

describe('getEliminatedReexportSources', () => {
  test('marks source literal only when all resolved targets are eliminated', () => {
    const module = makeModule('/barrel.js', {
      deps: [
        [
          'a1',
          makeResolvedDependency({
            absolutePath: '/a1.js',
            name: './a',
            reexportBindings: [{as: 'a', name: 'a', type: 'reExportNamed'}],
          }),
        ],
        [
          'a2',
          makeResolvedDependency({
            absolutePath: '/a2.js',
            name: './a',
            reexportBindings: [{as: 'a', name: 'a', type: 'reExportNamed'}],
          }),
        ],
        [
          'b',
          makeResolvedDependency({
            absolutePath: '/b.js',
            name: './b',
            reexportBindings: [{as: 'b', name: 'b', type: 'reExportNamed'}],
          }),
        ],
      ],
    });

    expect(
      getEliminatedReexportSources(module, new Set(['/a1.js', '/a2.js'])),
    ).toEqual({'./a': true});
  });
});

describe('computeReexportDemand', () => {
  test('records demand only for unambiguous export-star providers', () => {
    const barrelPath = '/barrel.js';
    const aPath = '/a.js';
    const bPath = '/b.js';

    const graph = makeGraph({
      entryPoints: [],
      modules: [
        [
          barrelPath,
          makeModule(barrelPath, {
            deps: [
              ['a', makeResolvedReexportAllDependency('./a', aPath)],
              ['b', makeResolvedReexportAllDependency('./b', bPath)],
            ],
            directExportNames: ['foo'],
            exports: [
              {source: './a', type: 'reExportAll'},
              {source: './b', type: 'reExportAll'},
            ],
          }),
        ],
        [
          aPath,
          makeModule(aPath, {
            directExportNames: ['bar'],
            exports: [{localName: 'bar', name: 'bar', type: 'named'}],
          }),
        ],
        [
          bPath,
          makeModule(bPath, {
            directExportNames: ['baz'],
            exports: [{localName: 'baz', name: 'baz', type: 'named'}],
          }),
        ],
      ],
    });

    const usedExports: UsedExportsMap = new Map();
    usedExports.set(barrelPath, usedNamed(['default', 'foo', 'bar']));
    usedExports.set(aPath, usedNone());
    usedExports.set(bPath, usedNone());

    expect(computeReexportDemand(graph, usedExports)).toEqual(
      new Map([[barrelPath, {'./a': ['bar']}]]),
    );
  });

  test('skips demand when export-star attribution is ambiguous', () => {
    const barrelPath = '/barrel.js';
    const aPath = '/a.js';
    const bPath = '/b.js';

    const graph = makeGraph({
      entryPoints: [],
      modules: [
        [
          barrelPath,
          makeModule(barrelPath, {
            deps: [
              ['a', makeResolvedReexportAllDependency('./a', aPath)],
              ['b', makeResolvedReexportAllDependency('./b', bPath)],
            ],
            exports: [
              {source: './a', type: 'reExportAll'},
              {source: './b', type: 'reExportAll'},
            ],
          }),
        ],
        [
          aPath,
          makeModule(aPath, {
            directExportNames: ['bar'],
            exports: [{localName: 'bar', name: 'bar', type: 'named'}],
          }),
        ],
        [
          bPath,
          makeModule(bPath, {
            directExportNames: ['bar'],
            exports: [{localName: 'bar', name: 'bar', type: 'named'}],
          }),
        ],
      ],
    });

    const usedExports: UsedExportsMap = new Map();
    usedExports.set(barrelPath, usedNamed(['bar']));
    usedExports.set(aPath, usedNone());
    usedExports.set(bPath, usedNone());

    expect(
      computeReexportDemand(graph, usedExports).get(barrelPath),
    ).toBeUndefined();
  });

  test('supports unambiguous nested export-star attribution', () => {
    const barrelPath = '/barrel.js';
    const midPath = '/mid.js';
    const leafPath = '/leaf.js';

    const graph = makeGraph({
      entryPoints: [],
      modules: [
        [
          barrelPath,
          makeModule(barrelPath, {
            deps: [
              ['mid', makeResolvedReexportAllDependency('./mid', midPath)],
            ],
            exports: [{source: './mid', type: 'reExportAll'}],
          }),
        ],
        [
          midPath,
          makeModule(midPath, {
            deps: [
              ['leaf', makeResolvedReexportAllDependency('./leaf', leafPath)],
            ],
            exports: [{source: './leaf', type: 'reExportAll'}],
          }),
        ],
        [
          leafPath,
          makeModule(leafPath, {
            directExportNames: ['foo'],
            exports: [{localName: 'foo', name: 'foo', type: 'named'}],
          }),
        ],
      ],
    });

    const usedExports: UsedExportsMap = new Map();
    usedExports.set(barrelPath, usedNamed(['foo']));
    usedExports.set(midPath, usedNone());
    usedExports.set(leafPath, usedNone());

    expect(computeReexportDemand(graph, usedExports)).toEqual(
      new Map([[barrelPath, {'./mid': ['foo']}]]),
    );
  });
});
