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

import type {PackageInfo, PackageJson, ResolutionContext} from './types';

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

  const replacements = getSubpathReplacements(pkg, mainFields);
  if (replacements) {
    const variants = [
      main,
      main.slice(0, 2) === './' ? main.slice(2) : './' + main,
    ];

    for (const variant of variants) {
      const match =
        replacements[variant] ||
        replacements[variant + '.js'] ||
        replacements[variant + '.json'] ||
        replacements[variant.replace(/(\.js|\.json)$/, '')];

      if (match) {
        main = match;
        break;
      }
    }
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
        fromPackage,
        mainFields,
      );

      if (redirectedPath != null) {
        // Since the redirected path is still relative to the package root,
        // we have to transform it back to be module-relative (as it
        // originally was)
        if (redirectedPath !== false) {
          redirectedPath =
            './' +
            path.relative(
              path.dirname(originModulePath),
              path.resolve(fromPackage.rootPath, redirectedPath),
            );
        }

        return redirectedPath;
      }
    }
  } else {
    const pck = path.isAbsolute(modulePath)
      ? getPackageForModule(modulePath)
      : getPackageForModule(originModulePath);

    if (pck) {
      const redirectedPath = matchSubpathFromMainFields(
        modulePath,
        pck,
        mainFields,
      );

      if (redirectedPath != null) {
        return redirectedPath;
      }
    }
  }

  return modulePath;
}

function matchSubpathFromMainFields(
  name: string,
  {packageJson, rootPath}: PackageInfo,
  mainFields: $ReadOnlyArray<string>,
): string | false | null {
  const replacements = getSubpathReplacements(packageJson, mainFields);

  if (!replacements || typeof replacements !== 'object') {
    return name;
  }

  if (!path.isAbsolute(name)) {
    const replacement = replacements[name];
    // support exclude with "someDependency": false
    return replacement === false ? false : replacement || name;
  }

  let relPath = './' + path.relative(rootPath, name);
  if (path.sep !== '/') {
    relPath = relPath.replace(new RegExp('\\' + path.sep, 'g'), '/');
  }

  let redirect = replacements[relPath];

  // false is a valid value
  if (redirect == null) {
    redirect = replacements[relPath + '.js'];
    if (redirect == null) {
      redirect = replacements[relPath + '.json'];
    }
  }

  // support exclude with "./someFile": false
  if (redirect === false) {
    return false;
  }

  if (redirect) {
    return path.join(rootPath, redirect);
  }

  return name;
}

/**
 * Get the subpath replacements defined by any object values for `mainFields` in
 * the passed `package.json`
 * (https://github.com/defunctzombie/package-browser-field-spec#replace-specific-files---advanced).
 */
function getSubpathReplacements(
  pkg: PackageJson,
  mainFields: $ReadOnlyArray<string>,
): {[subpath: string]: string | false} | null {
  const replacements = mainFields
    .map(name => pkg[name])
    .filter(value => value != null && typeof value !== 'string');

  if (!replacements.length) {
    return null;
  }

  return Object.assign({}, ...replacements.reverse());
}
