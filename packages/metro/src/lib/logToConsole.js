/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

/* eslint-disable no-console */

'use strict';

const chalk = require('chalk');

const groupStack = [];
let collapsedGuardTimer;

module.exports = (level, data) => {
  const logFunction = console[level] && level !== 'trace' ? level : 'log';
  const color =
    level === 'error' ? 'red' : level === 'warn' ? 'yellow' : 'white';

  if (level === 'group') {
    groupStack.push(level);
  } else if (level === 'groupCollapsed') {
    groupStack.push(level);
    clearTimeout(collapsedGuardTimer);
    // Inform users that logs get swallowed if they forget to call `groupEnd`.
    collapsedGuardTimer = setTimeout(() => {
      if (groupStack.includes('groupCollapsed')) {
        console.warn(
          chalk.inverse.yellow.bold(' WARN '),
          'Expected `console.groupEnd` to be called after `console.groupCollapsed`.',
        );
        groupStack.length = 0;
      }
    }, 3000);
    return;
  } else if (level === 'groupEnd') {
    groupStack.pop();
    if (!groupStack.length) {
      clearTimeout(collapsedGuardTimer);
    }
    return;
  }

  if (!groupStack.includes('groupCollapsed')) {
    console[logFunction](
      chalk.inverse[color].bold(` ${logFunction.toUpperCase()} `),
      ...data,
    );
  }
};
