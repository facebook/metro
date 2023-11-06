/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 * @oncall react_native
 */

'use strict';

const fs = require('fs');
const invariant = require('invariant');
const path = require('path');

function updateVersion(version /*: ?string */) {
  if (version == null) {
    throw new Error('Please specify a version in the form "1.2.3"');
  }
  if (!version.match(/^\d+\.\d+\.\d+$/)) {
    throw new Error(`Invalid version number (e.g. "1.2.3"): ${version}`);
  }

  const metroDirPath = path.join(__dirname, '..');
  const subPackageNameSet = new Set(
    fs
      .readdirSync(path.join(metroDirPath, 'packages'))
      .filter(dir => !dir.startsWith('.')),
  );

  updateAllPackageManifests(metroDirPath, version, subPackageNameSet);
}

function updateAllPackageManifests(
  metroDirPath /*: string */,
  newVersion /*: string */,
  subPackageNameSet /*: $ReadOnlySet<string> */,
) {
  subPackageNameSet.forEach(pkgName => {
    const subPackagePackPath = path.join(
      metroDirPath,
      'packages',
      pkgName,
      'package.json',
    );
    mutateManifestFile(subPackagePackPath, manifest => {
      manifest.version = newVersion;
      // update local cross deps with new version as well
      [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'resolutions',
      ].forEach(key => {
        const deps = manifest[key];
        invariant(
          deps == null || (typeof deps === 'object' && !Array.isArray(deps)),
          `Unexpected type for ${subPackagePackPath}#${key}`,
        );
        updateCrossDepsInline(deps, subPackageNameSet, newVersion);
      });
    });
  });
}

// given a dependency object (from package.json) update version for local pkgs
function updateCrossDepsInline(
  allDeps /*: {[string]: mixed, ...} */, // json object
  subDeps /*: $ReadOnlySet<string> */,
  version /*: string */,
) {
  if (allDeps) {
    Object.keys(allDeps).forEach(name => {
      if (subDeps.has(name)) {
        allDeps[name] = version;
      }
    });
  }
}

// update the package.json as JSON object
function mutateManifestFile(
  filePath /*: string */,
  mutator /*: (manifest: {
    [string]: string | number | Array<mixed> | {[string]: mixed, ...},
  }) => void */,
) {
  const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  mutator(manifest);
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

// Usage: node ./scripts/updateVersion 1.2.3
updateVersion(process.argv[2]);
