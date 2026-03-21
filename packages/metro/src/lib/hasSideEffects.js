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

import fs from 'fs';
// $FlowFixMe[untyped-import] micromatch is used for glob matching in sideEffects patterns.
import micromatch from 'micromatch';
import path from 'path';

/**
 * Build a `(modulePath) => boolean` function that reads sideEffects from
 * each module's nearest package.json (with an in-process cache).
 */
export function buildHasSideEffectsFn(): (modulePath: string) => boolean {
  const dirToInfo: Map<string, {sideEffects: mixed, root: string} | null> =
    new Map();
  const pkgSideEffects: Map<string, mixed> = new Map();

  function lookupDir(dir: string): {sideEffects: mixed, root: string} | null {
    if (dirToInfo.has(dir)) {
      return dirToInfo.get(dir) ?? null;
    }
    const pkgJsonPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      let sideEffects: mixed = undefined;
      if (!pkgSideEffects.has(pkgJsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
          sideEffects = pkg.sideEffects;
        } catch {}
        pkgSideEffects.set(pkgJsonPath, sideEffects);
      } else {
        sideEffects = pkgSideEffects.get(pkgJsonPath);
      }
      const info = {sideEffects, root: dir};
      dirToInfo.set(dir, info);
      return info;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      dirToInfo.set(dir, null);
      return null;
    }
    const result = lookupDir(parent);
    dirToInfo.set(dir, result);
    return result;
  }

  return (modulePath: string): boolean => {
    const info = lookupDir(path.dirname(modulePath));
    if (info == null) {
      return true; // no package.json found → assume side effects
    }
    const {sideEffects} = info;
    if (sideEffects == null || sideEffects === true || sideEffects === false) {
      const normalizedSideEffects: boolean | void =
        sideEffects == null ? undefined : sideEffects;
      return hasSideEffects(modulePath, normalizedSideEffects, info.root);
    }
    if (Array.isArray(sideEffects)) {
      const patterns: Array<string> = [];
      for (const item of sideEffects) {
        if (typeof item !== 'string') {
          return true;
        }
        patterns.push(item);
      }
      return hasSideEffects(modulePath, patterns, info.root);
    }
    return true;
  };
}

/**
 * Determines whether a module has side effects based on the `sideEffects`
 * field from its package.json.
 *
 * - `undefined` / `true`  → assume side effects (conservative default)
 * - `false`               → entire package is side-effect-free
 * - `Array<string>`       → glob patterns of files that have side effects
 *
 * @param modulePath  Absolute path to the module file.
 * @param sideEffects The value of the `sideEffects` field (from package.json).
 * @param packageRoot Absolute path to the directory containing package.json.
 */
export default function hasSideEffects(
  modulePath: string,
  sideEffects: boolean | ReadonlyArray<string> | void,
  packageRoot: string,
): boolean {
  if (sideEffects == null || sideEffects === true) {
    return true;
  }
  if (sideEffects === false) {
    return false;
  }
  const relativePath = path
    .relative(packageRoot, modulePath)
    .split(path.sep)
    .join('/');
  return (
    micromatch.isMatch(relativePath, sideEffects) ||
    micromatch.isMatch('./' + relativePath, sideEffects)
  );
}
