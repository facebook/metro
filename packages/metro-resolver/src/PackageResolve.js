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

import type {PackageJson} from './types';

/**
 * Resolve the main entry point for a package.
 *
 * Implements legacy (non-exports) package resolution behaviour based on the
 * "browser" field spec (https://github.com/defunctzombie/package-browser-field-spec).
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
    const variants = [main];
    if (main.slice(0, 2) === './') {
      variants.push(main.slice(2));
    } else {
      variants.push('./' + main);
    }

    for (const variant of variants) {
      const winner =
        replacements[variant] ||
        replacements[variant + '.js'] ||
        replacements[variant + '.json'] ||
        replacements[variant.replace(/(\.js|\.json)$/, '')];

      if (winner) {
        main = winner;
        break;
      }
    }
  }

  return main;
}

/**
 * Get the subpath replacements defined by any non-string `mainFields` values
 * (https://github.com/defunctzombie/package-browser-field-spec#replace-specific-files---advanced).
 */
export function getSubpathReplacements(
  pkg: PackageJson,
  mainFields: $ReadOnlyArray<string>,
): {[subpath: string]: string | false} | null {
  const replacements = mainFields
    .map((name: string) => {
      // If the field is a string, that doesn't mean we want to redirect the
      //  `main` file itself to anything else. See the spec.
      if (!pkg[name] || typeof pkg[name] === 'string') {
        return null;
      }

      return pkg[name];
    })
    .filter(Boolean);

  if (!replacements.length) {
    return null;
  }

  return Object.assign({}, ...replacements.reverse());
}
