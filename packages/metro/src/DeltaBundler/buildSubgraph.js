/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {RequireContext} from '../lib/contextModule';
import type {VirtualModules} from './FutureModules';
import type {
  Dependency,
  ModuleData,
  ResolvedDependency,
  ResolveFn,
  TransformFn,
  TransformResultDependency,
} from './types';

import {deriveAbsolutePathFromContext} from '../lib/contextModule';
import {isResolvedDependency} from '../lib/isResolvedDependency';
import path from 'path';

type Parameters<T> = $ReadOnly<{
  resolve: ResolveFn,
  transform: TransformFn<T>,
  shouldTraverse: ResolvedDependency => boolean,
}>;

function resolveDependencies(
  parentPath: string,
  dependencies: $ReadOnlyArray<TransformResultDependency>,
  resolve: ResolveFn,
  virtualModules?: ?VirtualModules,
): {
  dependencies: Map<string, Dependency>,
  resolvedContexts: Map<string, RequireContext>,
} {
  const maybeResolvedDeps = new Map<string, Dependency>();
  const resolvedContexts = new Map<string, RequireContext>();

  for (const dep of dependencies) {
    let maybeResolvedDep: Dependency;
    const key = dep.data.key;

    // `require.context`
    const {contextParams} = dep.data;
    const {isVirtualModule} = dep.data;
    if (isVirtualModule === true) {
      maybeResolvedDep = {
        absolutePath: dep.data.absolutePath ?? '',
        data: dep,
      };
    } else if (contextParams) {
      // Ensure the filepath has uniqueness applied to ensure multiple `require.context`
      // statements can be used to target the same file with different properties.
      const from = path.join(parentPath, '..', dep.name);
      const absolutePath = deriveAbsolutePathFromContext(from, contextParams);

      const resolvedContext: RequireContext = {
        from,
        mode: contextParams.mode,
        recursive: contextParams.recursive,
        filter: new RegExp(
          contextParams.filter.pattern,
          contextParams.filter.flags,
        ),
      };

      resolvedContexts.set(key, resolvedContext);

      maybeResolvedDep = {
        absolutePath,
        data: dep,
      };
    } else {
      try {
        maybeResolvedDep = {
          absolutePath: resolve(parentPath, dep, virtualModules).filePath,
          data: dep,
        };
      } catch (error) {
        // Ignore unavailable optional dependencies. They are guarded
        // with a try-catch block and will be handled during runtime.
        if (dep.data.isOptional !== true) {
          throw error;
        }
        maybeResolvedDep = {
          data: dep,
        };
      }
    }

    if (maybeResolvedDeps.has(key)) {
      throw new Error(
        `resolveDependencies: Found duplicate dependency key '${key}' in ${parentPath}`,
      );
    }
    maybeResolvedDeps.set(key, maybeResolvedDep);
  }

  return {
    dependencies: maybeResolvedDeps,
    resolvedContexts,
  };
}

export async function buildSubgraph<T>(
  entryPaths: $ReadOnlySet<string>,
  resolvedContexts: $ReadOnlyMap<string, ?RequireContext>,
  {resolve, transform, shouldTraverse}: Parameters<T>,
  virtualModules?: ?VirtualModules,
): Promise<{
  moduleData: Map<string, ModuleData<T>>,
  errors: Map<string, Error>,
}> {
  const moduleData: Map<string, ModuleData<T>> = new Map();
  const errors: Map<string, Error> = new Map();
  const visitedPaths: Set<string> = new Set();

  async function visit(
    absolutePath: string,
    requireContext: ?RequireContext,
    virtualModules?: ?VirtualModules,
  ): Promise<void> {
    if (visitedPaths.has(absolutePath)) {
      return;
    }
    visitedPaths.add(absolutePath);
    const transformResult = await transform(
      absolutePath,
      requireContext,
      virtualModules,
    );

    virtualModules?.addRawMap(transformResult?.virtualModulesRawMap);

    // Get the absolute path of all sub-dependencies (some of them could have been
    // moved but maintain the same relative path).
    const resolutionResult = resolveDependencies(
      absolutePath,
      transformResult.dependencies,
      resolve,
      virtualModules,
    );

    moduleData.set(absolutePath, {
      ...transformResult,
      ...resolutionResult,
    });

    await Promise.all(
      [...resolutionResult.dependencies.values()]
        .filter(
          dependency =>
            isResolvedDependency(dependency) && shouldTraverse(dependency),
        )
        .map(dependency =>
          visit(
            dependency.absolutePath,
            resolutionResult.resolvedContexts.get(dependency.data.data.key),
            virtualModules,
          ).catch(error => errors.set(dependency.absolutePath, error)),
        ),
    );
  }

  await Promise.all(
    [...entryPaths].map(absolutePath =>
      visit(
        absolutePath,
        resolvedContexts.get(absolutePath),
        virtualModules,
      ).catch(error => errors.set(absolutePath, error)),
    ),
  );

  return {moduleData, errors};
}
