/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

import type {PackageJson, ResolutionContext} from './types';

import path from 'path';
import toPosixPath from './utils/toPosixPath';

/**
 * Resolve the main entry point for a package.
 *
 * Implements legacy (non-exports) package resolution behaviour based on the
 * ["browser" field spec](https://github.com/defunctzombie/package-browser-field-spec).
 */
export function getPackageEntryPoint(
  pkg: PackageJson,
  mainFields: $ReadOnlyArray<string>,
): string {
  let main = 'index';

  for (const name of mainFields) {
    if (typeof pkg[name] === 'string' && pkg[name].length) {
      main = pkg[name];
      break;
    }
  }

  // NOTE: Additional variants are used when checking for subpath replacements
  // against the main entry point. This inconsistent with those matched by
  // `redirectModulePath`, but we are preserving this long-standing behaviour.
  const variants = [
    main,
    main.slice(0, 2) === './' ? main.slice(2) : './' + main,
  ].flatMap(variant => [
    variant,
    variant + '.js',
    variant + '.json',
    variant.replace(/(\.js|\.json)$/, ''),
  ]);

  const replacement = matchSubpathFromMainFields(variants, pkg, mainFields);

  if (typeof replacement === 'string') {
    return replacement;
  }

  return main;
}

export function redirectModulePath(
  context: $ReadOnly<{
    getPackageForModule: ResolutionContext['getPackageForModule'],
    mainFields: ResolutionContext['mainFields'],
    originModulePath: ResolutionContext['originModulePath'],
    ...
  }>,
  modulePath: string,
): string | false {
  const {getPackageForModule, mainFields, originModulePath} = context;

  if (modulePath.startsWith('.')) {
    const fromPackage = getPackageForModule(originModulePath);

    if (fromPackage) {
      // We need to convert the module path from module-relative to
      // package-relative, so that we can easily match it against the
      // "browser" map (where all paths are relative to the package root)
      const packageRelativeModulePath =
        './' +
        path.relative(
          fromPackage.rootPath,
          path.resolve(path.dirname(originModulePath), modulePath),
        );

      let redirectedPath = matchSubpathFromMainFields(
        toPosixPath(packageRelativeModulePath),
        fromPackage.packageJson,
        mainFields,
      );

      if (redirectedPath != null) {
        // Since the redirected path is still relative to the package root,
        // we have to transform it back to be module-relative (as it
        // originally was)
        if (redirectedPath !== false) {
          redirectedPath = path.resolve(fromPackage.rootPath, redirectedPath);
        }

        return redirectedPath;
      }
    }
  } else {
    const pck = path.isAbsolute(modulePath)
      ? getPackageForModule(modulePath)
      : getPackageForModule(originModulePath);

    if (pck) {
      const packageRelativeModulePath = path.isAbsolute(modulePath)
        ? './' +
          path.relative(
            pck.rootPath,
            path.resolve(path.dirname(originModulePath), modulePath),
          )
        : modulePath;

      let redirectedPath = matchSubpathFromMainFields(
        toPosixPath(packageRelativeModulePath),
        pck.packageJson,
        mainFields,
      );

      if (redirectedPath != null) {
        // BRITTLE ASSUMPTION: If an absolute path is inputted, the path or
        // specifier mapped to should always be interpreted as a relative path
        // (even if it points to a package name)
        if (path.isAbsolute(modulePath) && typeof redirectedPath === 'string') {
          redirectedPath = path.resolve(pck.rootPath, redirectedPath);
        }

        return redirectedPath;
      }
    }
  }

  return modulePath;
}

/**
 * Get the mapped replacement for the given subpath defined by matching
 * `mainFields` entries in the passed `package.json`
 * (https://github.com/defunctzombie/package-browser-field-spec#replace-specific-files---advanced).
 *
 * Returns either:
 * - A `string` with the matched replacement subpath.
 * - `false`, indicating the module should be ignored.
 * - `null` when there is no entry for the subpath.
 */
function matchSubpathFromMainFields(
  /**
   * The subpath, or set of subpath variants, to match. Can be either a
   * package-relative subpath (beginning with '.') or a bare import specifier
   * which may replace a module in another package.
   */
  subpath: string | $ReadOnlyArray<string>,
  pkg: PackageJson,
  mainFields: $ReadOnlyArray<string>,
): string | false | null {
  const fieldValues = mainFields
    .map(name => pkg[name])
    .filter(value => value != null && typeof value !== 'string');

  if (!fieldValues.length) {
    return null;
  }

  const replacements = Object.assign({}, ...fieldValues.reverse());
  const variants = Array.isArray(subpath)
    ? subpath
    : expandSubpathVariants(subpath);

  for (const variant of variants) {
    const replacement = replacements[variant];

    if (replacement != null) {
      return replacement;
    }
  }

  return null;
}

/**
 * Get the expanded variants for a given subpath to try against mappings in
 * `package.json`. This is unique to "main" and the "browser" spec.
 */
function expandSubpathVariants(subpath: string): Array<string> {
  return [subpath, subpath + '.js', subpath + '.json'];
}
