/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const chalk = require('chalk');
const formatLogTimestamp = require('./formatLogTimestamp');

import type {Terminal} from 'metro-core';

const groupStack = [];
let collapsedGuardTimer;

/**
 * Automatically adds a timestamp and color-coded level tag and handles
 * grouping like console.
 */
function logWithTimestamp(
  terminal: Terminal,
  level: string,
  ...args: Array<mixed>
): void {
  if (level === 'group') {
    groupStack.push(level);
  } else if (level === 'groupCollapsed') {
    groupStack.push(level);
    clearTimeout(collapsedGuardTimer);
    // Inform users that logs get swallowed if they forget to call `groupEnd`.
    collapsedGuardTimer = setTimeout(() => {
      if (groupStack.includes('groupCollapsed')) {
        terminal.log(
          chalk.inverse.yellow.bold(' WARN '),
          'Expected `console.groupEnd` to be called after `console.groupCollapsed`.',
        );
        groupStack.length = 0;
      }
    }, 3000);
  } else if (level === 'groupEnd') {
    const popped = groupStack.pop();
    if (popped == null) {
      terminal.log(
        chalk.inverse.yellow.bold(' WARN '),
        '`console.groupEnd` called with no group started.',
      );
    }
    if (groupStack.length === 0) {
      clearTimeout(collapsedGuardTimer);
    }
    return;
  }

  if (level === 'groupCollapsed' || !groupStack.includes('groupCollapsed')) {
    const ci = chalk.inverse;
    const color =
      level === 'error' ? ci.red : level === 'warn' ? ci.yellow : ci.white;
    const levelTag = color.bold(` ${level.toUpperCase()} `);
    const justify = ''.padEnd(5 - level.length, ' ') + ' ';
    const groupInset = ''.padEnd(groupStack.length * 2, '.') + ' ';
    terminal.log(
      formatLogTimestamp(new Date()) + levelTag + justify + groupInset,
      ...(level === 'groupCollapsed'
        ? [...args, chalk.dim(' (viewable in debugger)')]
        : args),
    );
  }
}
module.exports = logWithTimestamp;
