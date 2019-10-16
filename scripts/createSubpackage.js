/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const fs = require('fs');
const path = require('path');
const rootFolder = path.join(__dirname, '../');

function createPackage(name) {
  if (!name) {
    throw new Error('You should pass the package name as the first argument.');
  }

  const packagePath = path.join(rootFolder, 'packages', name);

  if (fs.existsSync(packagePath)) {
    throw new Error('The specified package already exists.');
  }

  const version = require('../lerna.json').version;

  const packageJson = {
    name,
    version,
    description: name,
    main: 'src/index.js',
    repository: {
      type: 'git',
      url: 'git@github.com:facebook/metro.git',
    },
    scripts: {
      'prepare-release':
        'test -d build && rm -rf src.real && mv src src.real && mv build src',
      'cleanup-release': 'test ! -e build && mv src build && mv src.real src',
    },
    keywords: ['metro'],
    license: 'MIT',
    dependencies: {},
  };

  fs.mkdirSync(packagePath);
  fs.mkdirSync(path.join(packagePath, 'src'));

  fs.writeFileSync(
    path.join(packagePath, 'package.json'),
    JSON.stringify(packageJson, null, 2),
  );
  fs.writeFileSync(
    path.join(packagePath, '.npmignore'),
    [
      'BUCK',
      '**/__mocks__/**',
      '**/__tests__/**',
      'build',
      'src.real',
      'yarn.lock',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(packagePath, 'src', 'index.js'), '// TODO');

  fs.writeFileSync(
    path.join(packagePath, 'BUCK'),
    [
      'load("@fbsource//tools/build_defs/third_party:yarn_defs.bzl", "yarn_workspace")',
      '',
      'yarn_workspace(',
      '    name = "yarn-workspace",',
      '    srcs = glob(',
      '        ["src/**/*.js"],',
      '        exclude = [',
      '            "**/__fixtures__/**",',
      '            "**/__mocks__/**",',
      '            "**/__tests__/**",',
      '        ],',
      '    ),',
      '    visibility = ["PUBLIC"],',
      ')',
    ].join('\n'),
  );

  //eslint-disable-next-line no-console
  console.log(
    [
      'Package files created correctly!',
      'Please reserve the selected package name on npm by running `npm publish` from ' +
        path.relative(process.cwd(), packagePath),
      'After doing so, add metro-bot as an owner of the package by running `npm owner add metro-bot ' +
        name +
        '`',
    ].join('\n'),
  );
}

const name = process.argv[2];

try {
  createPackage(name);
} catch (e) {
  console.error('Error! ' + e.message);
  process.exit(1);
}
