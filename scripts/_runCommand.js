/**
 * Copyright (c) 2014-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

const spawn = require('child_process').spawnSync;
const chalk = require('chalk');

module.exports = function runCommand(cmd, args, cwd) {
  if (!cwd) {
    cwd = __dirname;
  }

  const displayArgs =
    args.length > 25 ? args.slice(0, 25) + '...' : args.join(' ');

  // eslint-disable-next-line no-console
  console.log(chalk.dim('$ cd ' + cwd + `\n$ ${cmd} ${displayArgs}\n`));
  const result = spawn(cmd, args, {
    cwd,
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) {
    const message = 'Error running command.';
    const error = new Error(message);
    error.stack = message;
    throw error;
  }
};
