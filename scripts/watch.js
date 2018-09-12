/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

/**
 * Watch files for changes and rebuild (copy from 'src/' to `build/`) if changed
 */

// eslint-disable no-console

const fs = require('fs');
const {execSync} = require('child_process');
const path = require('path');
const chalk = require('chalk');
const getPackages = require('./_getPackages');

const BUILD_CMD = `node ${path.resolve(__dirname, './build.js')}`;

let filesToBuild = new Map();

const exists = filename => {
  try {
    return fs.statSync(filename).isFile();
  } catch (e) {}
  return false;
};
const rebuild = filename => filesToBuild.set(filename, true);

getPackages().forEach(p => {
  const srcDir = path.resolve(p, 'src');
  try {
    fs.accessSync(srcDir, fs.F_OK);
    fs.watch(path.resolve(p, 'src'), {recursive: true}, (event, filename) => {
      const filePath = path.resolve(srcDir, filename);

      if ((event === 'change' || event === 'rename') && exists(filePath)) {
        // eslint-disable-next-line no-console
        console.log(chalk.green('->'), `${event}: ${filename}`);
        rebuild(filePath);
      } else {
        const buildFile = path.resolve(srcDir, '..', 'build', filename);
        try {
          fs.unlinkSync(buildFile);
          process.stdout.write(
            chalk.red('  \u2022 ') +
              path.relative(path.resolve(srcDir, '..', '..'), buildFile) +
              ' (deleted)' +
              '\n',
          );
        } catch (e) {}
      }
    });
  } catch (e) {
    // doesn't exist
  }
});

setInterval(() => {
  const files = Array.from(filesToBuild.keys());
  if (files.length) {
    filesToBuild = new Map();
    try {
      execSync(`${BUILD_CMD} ${files.join(' ')}`, {stdio: [0, 1, 2]});
    } catch (e) {}
  }
}, 100);

// eslint-disable-next-line no-console
console.log(chalk.red('->'), chalk.cyan('Watching for changes...'));
