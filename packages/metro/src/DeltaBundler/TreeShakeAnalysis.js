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
} from '../ModuleGraph/worker/collectDependencies';
import type {Module, ReadOnlyGraph, ResolvedDependency} from './types';

import {isResolvedDependency} from '../lib/isResolvedDependency';

export type UsedExports =
  | {type: 'all'}
  | {type: 'named', names: Set<string>}
  | {type: 'none'};

export type UsedExportsMap = Map<string, UsedExports>;
export type ReexportDemandMap = Map<
  string,
  {[sourceLiteral: string]: ReadonlyArray<string>},
>;

/**
 * Compute the set of used exports per module and the set of modules that can
 * be safely eliminated from the bundle.
 *
 * Uses a two-level fixpoint:
 *  - Inner: monotone propagation of used-export demands over the live set.
 *  - Outer: shrinks the live set by eliminating provably dead modules, then
 *    repeats until stable.
 *
 * Terminates because the live set only shrinks and is finite.
 */
export function analyzeAndEliminate(
  graph: ReadOnlyGraph<>,
  hasSideEffectsFn: (modulePath: string) => boolean,
): {usedExports: UsedExportsMap, eliminable: Set<string>} {
  const liveModules: Set<string> = new Set(graph.dependencies.keys());
  const allEliminable: Set<string> = new Set();
  let result: ?{usedExports: UsedExportsMap, eliminable: Set<string>} = null;

  while (result == null) {
    const usedExports = computeUsedExports(graph, liveModules);
    const newlyEliminable = findEliminable(
      graph,
      usedExports,
      liveModules,
      hasSideEffectsFn,
    );

    if (newlyEliminable.size === 0) {
      result = {usedExports, eliminable: allEliminable};
      break;
    }

    for (const modulePath of newlyEliminable) {
      liveModules.delete(modulePath);
      allEliminable.add(modulePath);
    }
  }

  if (result == null) {
    throw new Error('Expected analyzeAndEliminate result');
  }

  return result;
}

/**
 * Build the `eliminatedReexportSources` map for a single module.
 *
 * Maps source literal strings (as they appear in `export { x } from 'HERE'`)
 * to `true` if every resolved target for that literal was eliminated.
 *
 * Keyed by `dep.data.name` (the AST source literal) because that is what
 * `stripUnusedExports` sees in `path.node.source.value`.
 */
export function getEliminatedReexportSources(
  module: Module<>,
  eliminable: Set<string>,
): {[sourceLiteral: string]: true} {
  const result: {[sourceLiteral: string]: true} = {};
  const seenNames: Map<string, {allEliminated: boolean}> = new Map();

  for (const [, dep] of module.dependencies) {
    if (!dep.data.data.reexportBindings?.length) {
      continue;
    }
    const name = dep.data.name;
    const isEliminated =
      isResolvedDependency(dep) && eliminable.has(dep.absolutePath);
    const existing = seenNames.get(name);
    if (existing != null) {
      existing.allEliminated = existing.allEliminated && isEliminated;
    } else {
      seenNames.set(name, {allEliminated: isEliminated});
    }
  }

  for (const [name, info] of seenNames) {
    if (info.allEliminated) {
      // $FlowFixMe[prop-missing]
      result[name] = true;
    }
  }
  return result;
}

export function computeReexportDemand(
  graph: ReadOnlyGraph<>,
  usedExports: UsedExportsMap,
): ReexportDemandMap {
  const demandByModule: ReexportDemandMap = new Map();

  for (const [modulePath, moduleUsed] of usedExports) {
    if (moduleUsed.type !== 'named') {
      continue;
    }
    const module = graph.dependencies.get(modulePath);
    const moduleSyntax = module?.moduleSyntax;
    if (
      module == null ||
      moduleSyntax == null ||
      moduleSyntax.isESModule !== true
    ) {
      continue;
    }

    const starSources = moduleSyntax.exports
      .filter(binding => binding.type === 'reExportAll')
      .map(binding => binding.source);
    if (starSources.length === 0) {
      continue;
    }

    const explicitlyExportedNames = new Set(moduleSyntax.directExportNames);
    for (const binding of moduleSyntax.exports) {
      if (binding.type === 'reExportNamed') {
        explicitlyExportedNames.add(binding.as);
      }
    }

    const pendingNames = [...moduleUsed.names].filter(
      name => name !== 'default' && !explicitlyExportedNames.has(name),
    );
    if (pendingNames.length === 0) {
      continue;
    }

    const localDemand: Map<string, Set<string>> = new Map();
    for (const name of pendingNames) {
      const providerSource = findUnambiguousStarProvider(
        graph,
        module,
        starSources,
        name,
      );
      if (providerSource != null) {
        const existing = localDemand.get(providerSource);
        if (existing != null) {
          existing.add(name);
        } else {
          localDemand.set(providerSource, new Set([name]));
        }
      }
    }

    if (localDemand.size > 0) {
      const objectDemand: {[sourceLiteral: string]: ReadonlyArray<string>} = {};
      for (const [source, names] of localDemand) {
        objectDemand[source] = [...names].sort();
      }
      demandByModule.set(modulePath, objectDemand);
    }
  }

  return demandByModule;
}

function findUnambiguousStarProvider(
  graph: ReadOnlyGraph<>,
  module: Module<>,
  starSources: ReadonlyArray<string>,
  exportName: string,
): ?string {
  const providers: Array<string> = [];
  for (const sourceLiteral of starSources) {
    const dep = getResolvedReexportAllDependency(module, sourceLiteral);
    if (dep == null) {
      continue;
    }
    if (
      canModuleDefinitelyProvideName(
        graph,
        dep.absolutePath,
        exportName,
        new Set(),
      )
    ) {
      providers.push(sourceLiteral);
      if (providers.length > 1) {
        return null;
      }
    }
  }
  return providers.length === 1 ? providers[0] : null;
}

function getResolvedReexportAllDependency(
  module: Module<>,
  sourceLiteral: string,
): ?ResolvedDependency {
  for (const [, dep] of module.dependencies) {
    if (!isResolvedDependency(dep)) {
      continue;
    }
    if (dep.data.name !== sourceLiteral) {
      continue;
    }
    if (!dep.data.data.reexportBindings?.some(b => b.type === 'reExportAll')) {
      continue;
    }
    return dep;
  }
  return null;
}

function computeUsedExports(
  graph: ReadOnlyGraph<>,
  liveModules: Set<string>,
): UsedExportsMap {
  const usedExports: UsedExportsMap = new Map();

  for (const modulePath of liveModules) {
    usedExports.set(modulePath, {type: 'none'});
  }

  let changed = true;
  while (changed) {
    changed = false;

    for (const modulePath of liveModules) {
      const module = graph.dependencies.get(modulePath);
      if (module == null) {
        continue;
      }
      const moduleUsed = usedExports.get(modulePath);

      for (const [, dependency] of module.dependencies) {
        if (!isResolvedDependency(dependency)) {
          continue;
        }
        const depPath = dependency.absolutePath;
        if (!liveModules.has(depPath)) {
          continue;
        }

        const depImportBindings = dependency.data.data.importBindings;
        const depReexportBindings = dependency.data.data.reexportBindings;

        if (depImportBindings == null && depReexportBindings == null) {
          if (!dependency.data.data.isESMImport) {
            const depModule = graph.dependencies.get(depPath);
            if (depModule?.moduleSyntax?.isESModule === true) {
              if (usedExports.get(depPath)?.type !== 'all') {
                usedExports.set(depPath, {type: 'all'});
                changed = true;
              }
            }
          } else {
            if (usedExports.get(depPath)?.type !== 'all') {
              usedExports.set(depPath, {type: 'all'});
              changed = true;
            }
          }
          continue;
        }

        const currentUsed: UsedExports = usedExports.get(depPath) ?? {
          type: 'none',
        };
        if (currentUsed.type === 'all') {
          continue;
        }

        let newUsed: UsedExports = currentUsed;

        if (depImportBindings != null) {
          newUsed = propagateImportBindings(newUsed, depImportBindings);
        }

        if (
          depReexportBindings != null &&
          moduleUsed != null &&
          moduleUsed.type !== 'none'
        ) {
          newUsed = propagateReexportBindings(
            newUsed,
            depReexportBindings,
            moduleUsed,
          );
        }

        if (newUsed.type === 'all' || !usedExportsEqual(currentUsed, newUsed)) {
          usedExports.set(depPath, newUsed);
          changed = true;
        }
      }
    }
  }

  return usedExports;
}

function findEliminable(
  graph: ReadOnlyGraph<>,
  usedExports: UsedExportsMap,
  liveModules: Set<string>,
  hasSideEffectsFn: (modulePath: string) => boolean,
): Set<string> {
  const eliminable: Set<string> = new Set();

  for (const modulePath of liveModules) {
    const module = graph.dependencies.get(modulePath);
    if (module == null) {
      continue;
    }

    if (module.moduleSyntax?.isESModule !== true) {
      continue;
    }

    if (graph.entryPoints.has(modulePath)) {
      continue;
    }

    const used = usedExports.get(modulePath);
    if (used == null || used.type !== 'none') {
      continue;
    }

    if (hasSideEffectsFn(modulePath)) {
      continue;
    }

    let hasSideEffectImport = false;
    for (const consumerPath of module.inverseDependencies) {
      if (!liveModules.has(consumerPath)) {
        continue;
      }
      const consumer = graph.dependencies.get(consumerPath);
      if (consumer == null) {
        continue;
      }
      for (const [, dep] of consumer.dependencies) {
        if (
          isResolvedDependency(dep) &&
          dep.absolutePath === modulePath &&
          dep.data.data.importBindings?.some(b => b.type === 'sideEffectOnly')
        ) {
          hasSideEffectImport = true;
          break;
        }
      }
      if (hasSideEffectImport) {
        break;
      }
    }
    if (hasSideEffectImport) {
      continue;
    }

    eliminable.add(modulePath);
  }

  return eliminable;
}

function propagateImportBindings(
  current: UsedExports,
  bindings: ReadonlyArray<ImportBinding>,
): UsedExports {
  let result = current;
  for (const binding of bindings) {
    switch (binding.type) {
      case 'namespace':
        // import * as ns from 'x' → all exports used (Invariant #2)
        return {type: 'all'};
      case 'default':
        result = addUsedName(result, 'default');
        break;
      case 'named':
        result = addUsedName(result, binding.name);
        break;
      case 'sideEffectOnly':
        // import 'x' — don't mark any export names, retention handled elsewhere
        break;
      default:
        throw new Error('Unknown import binding type');
    }
  }
  return result;
}

function propagateReexportBindings(
  current: UsedExports,
  bindings: ReadonlyArray<ReexportBinding>,
  importerUsed: UsedExports,
): UsedExports {
  let result = current;
  for (const binding of bindings) {
    switch (binding.type) {
      case 'reExportAll':
        // export * from 'x' — conservative (no narrowing in v1, Invariant #9)
        if (importerUsed.type === 'all') {
          return {type: 'all'};
        }
        if (importerUsed.type === 'named') {
          for (const name of importerUsed.names) {
            result = addUsedName(result, name);
          }
        }
        break;

      case 'reExportNamespace':
        // export * as ns from 'x' — if 'ns' used → all of x is used
        if (importerUsed.type === 'all') {
          return {type: 'all'};
        }
        if (
          importerUsed.type === 'named' &&
          importerUsed.names.has(binding.as)
        ) {
          return {type: 'all'};
        }
        break;

      case 'reExportNamed':
        // export { foo } from 'x', export { foo as bar } from 'x', etc.
        // Uniform handling: if 'as' is used from importer, 'name' is used from dep
        if (importerUsed.type === 'all') {
          result = addUsedName(result, binding.name);
        } else if (
          importerUsed.type === 'named' &&
          importerUsed.names.has(binding.as)
        ) {
          result = addUsedName(result, binding.name);
        }
        break;

      default:
        throw new Error('Unknown re-export binding type');
    }
  }
  return result;
}

// ── Utility helpers ───────────────────────────────────────────────────────────

function addUsedName(current: UsedExports, name: string): UsedExports {
  if (current.type === 'all') {
    return current;
  }
  if (current.type === 'none') {
    return {type: 'named', names: new Set([name])};
  }
  if (current.names.has(name)) {
    return current;
  }
  const newNames = new Set(current.names);
  newNames.add(name);
  return {type: 'named', names: newNames};
}

function usedExportsEqual(a: UsedExports, b: UsedExports): boolean {
  if (a.type !== b.type) {
    return false;
  }
  if (a.type === 'named' && b.type === 'named') {
    if (a.names.size !== b.names.size) {
      return false;
    }
    for (const name of a.names) {
      if (!b.names.has(name)) {
        return false;
      }
    }
  }
  return true;
}

function canModuleDefinitelyProvideName(
  graph: ReadOnlyGraph<>,
  modulePath: string,
  exportName: string,
  visiting: Set<string>,
): boolean {
  const visitKey = `${modulePath}\0${exportName}`;
  if (visiting.has(visitKey)) {
    return false;
  }
  visiting.add(visitKey);

  const module = graph.dependencies.get(modulePath);
  const moduleSyntax = module?.moduleSyntax;
  if (
    module == null ||
    moduleSyntax == null ||
    moduleSyntax.isESModule !== true
  ) {
    visiting.delete(visitKey);
    return false;
  }

  if (moduleSyntax.directExportNames.has(exportName)) {
    visiting.delete(visitKey);
    return true;
  }
  for (const binding of moduleSyntax.exports) {
    if (binding.type === 'reExportNamed' && binding.as === exportName) {
      visiting.delete(visitKey);
      return true;
    }
    if (binding.type === 'reExportNamespace' && binding.as === exportName) {
      visiting.delete(visitKey);
      return true;
    }
  }

  const starSources = moduleSyntax.exports
    .filter(binding => binding.type === 'reExportAll')
    .map(binding => binding.source);
  const providers: Array<string> = [];
  for (const sourceLiteral of starSources) {
    const dep = getResolvedReexportAllDependency(module, sourceLiteral);
    if (dep == null) {
      continue;
    }
    if (
      canModuleDefinitelyProvideName(
        graph,
        dep.absolutePath,
        exportName,
        visiting,
      )
    ) {
      providers.push(sourceLiteral);
      if (providers.length > 1) {
        visiting.delete(visitKey);
        return false;
      }
    }
  }

  visiting.delete(visitKey);
  return providers.length === 1;
}
