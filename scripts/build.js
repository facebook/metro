/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @noformat
 */

// Note: cannot use prettier here because this file is ran as-is

/**
 * script to build (transpile) files.
 * By default it transpiles all files for all packages and writes them
 * into `build/` directory.
 * Non-js or files matching IGNORE_PATTERN will be copied without transpiling.
 *
 * Example:
 *  node ./scripts/build.js
 *  node ./scripts/build.js /user/c/metro/packages/metro-abc/src/abc.js
 */

'use strict';

const getPackages = require('./_getPackages');
const babel = require('@babel/core');
const chalk = require('chalk');
const fs = require('fs');
const glob = require('glob');
const micromatch = require('micromatch');
const path = require('path');
const prettier = require('prettier');

const SRC_DIR = 'src';
const BUILD_DIR = 'build';
const JS_FILES_PATTERN = '**/*.js';
const IGNORE_PATTERN = '**/__tests__/**';
const PACKAGES_DIR = path.resolve(__dirname, '../packages');

const fixedWidth = function(str/*: string*/) {
  const WIDTH = 80;
  const strs = str.match(new RegExp(`(.{1,${WIDTH}})`, 'g')) || [str];
  let lastString = strs[strs.length - 1];
  if (lastString.length < WIDTH) {
    lastString += Array(WIDTH - lastString.length).join(chalk.dim('.'));
  }
  return strs
    .slice(0, -1)
    .concat(lastString)
    .join('\n');
};

function getPackageName(file /*: string */) {
  return path.relative(PACKAGES_DIR, file).split(path.sep)[0];
}

function getBuildPath(file /*: string */, buildFolder /*: string */) {
  const pkgName = getPackageName(file);
  const pkgSrcPath = path.resolve(PACKAGES_DIR, pkgName, SRC_DIR);
  const pkgBuildPath = process.env.PACKAGES_DIR != null
    ? path.resolve(process.env.PACKAGES_DIR, pkgName, SRC_DIR)
    : path.resolve(PACKAGES_DIR, pkgName, buildFolder);
  const relativeToSrcPath = path.relative(pkgSrcPath, file);
  return path.resolve(pkgBuildPath, relativeToSrcPath);
}

function buildPackage(p /*: string */) {
  const srcDir = path.resolve(p, SRC_DIR);
  const pattern = path.resolve(srcDir, '**/*');
  const files = glob.sync(pattern, {nodir: true});

  process.stdout.write(fixedWidth(`${path.basename(p)}\n`));

  files.forEach(file => buildFile(file, true));
  process.stdout.write(`[  ${chalk.green('OK')}  ]\n`);
}

function buildFile(file /*: string */, silent /*: number | boolean */) {
  const destPath = getBuildPath(file, BUILD_DIR);

  fs.mkdirSync(path.dirname(destPath), {recursive: true});
  if (micromatch.isMatch(file, IGNORE_PATTERN)) {
    silent ||
      process.stdout.write(
        chalk.dim('  \u2022 ') +
          path.relative(PACKAGES_DIR, file) +
          ' (ignore)\n'
      );
  } else if (!micromatch.isMatch(file, JS_FILES_PATTERN)) {
    fs.createReadStream(file).pipe(fs.createWriteStream(destPath));
    silent ||
      process.stdout.write(
        chalk.red('  \u2022 ') +
          path.relative(PACKAGES_DIR, file) +
          chalk.red(' \u21D2 ') +
          path.relative(PACKAGES_DIR, destPath) +
          ' (copy)' +
          '\n'
      );
  } else {
    const transformed = prettier.format(babel.transformFileSync(file, {}).code, {
      parser: 'babel',
    });
    fs.writeFileSync(destPath, transformed);
    const source = fs.readFileSync(file).toString('utf-8');
    if (/\@flow/.test(source)) {
      fs.createReadStream(file).pipe(fs.createWriteStream(destPath + '.flow'));
    }
    silent ||
      process.stdout.write(
        chalk.green('  \u2022 ') +
          path.relative(PACKAGES_DIR, file) +
          chalk.green(' \u21D2 ') +
          path.relative(PACKAGES_DIR, destPath) +
          '\n'
      );
  }
}

const files = process.argv.slice(2);

if (files.length) {
  files.forEach(buildFile);
} else {
  process.stdout.write(chalk.bold.inverse('Building packages') + ' (using Babel v' + babel.version + ')\n');
  getPackages().forEach(buildPackage);
  process.stdout.write('\n');
}
