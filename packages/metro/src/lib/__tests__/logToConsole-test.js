/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

/* eslint-disable no-console */

'use strict';

jest.mock('chalk', () => {
  const bold = _ => _;
  return {
    inverse: {
      red: {bold},
      white: {bold},
      yellow: {bold},
    },
  };
});

let log;

beforeEach(() => {
  jest.resetModules();
  log = require('../logToConsole');

  console.log = jest.fn();
});

test('invoke native console methods', () => {
  log(console, 'log', 'BRIDGE', 'Banana');
  log(console, 'warn', 'BRIDGE', 'Apple');
  log(console, 'warn', 'BRIDGE', 'Kiwi');
  jest.runAllTimers();

  expect(console.log).toHaveBeenNthCalledWith(1, ' LOG ', 'Banana');
  expect(console.log).toHaveBeenNthCalledWith(2, ' WARN ', 'Apple');
  expect(console.log).toHaveBeenNthCalledWith(3, ' WARN ', 'Kiwi');
});

test('removes excess whitespace', () => {
  log(console, 'log', 'BRIDGE', 'Banana\n   ');
  jest.runAllTimers();

  expect(console.log).toHaveBeenNthCalledWith(1, ' LOG ', 'Banana');
});

test('ignore `groupCollapsed` calls', () => {
  log(console, 'groupCollapsed', 'BRIDGE');
  log(console, 'groupEnd', 'BRIDGE');
  jest.runAllTimers();

  expect(console.log).not.toHaveBeenCalled();
});

test('warn if `groupCollapsed` and `groupEnd` are not balanced', () => {
  log(console, 'groupCollapsed', 'BRIDGE');
  jest.runAllTimers();

  expect(console.log).toHaveBeenCalledWith(
    ' WARN ',
    'Expected `console.groupEnd` to be called after `console.groupCollapsed`.',
  );

  // Ensure that the console resets the state and will accept new logs
  log(console, 'warn', 'BRIDGE', 'Apple');
  jest.runAllTimers();
  expect(console.log).toHaveBeenCalledWith(' WARN ', 'Apple');
});

test('can deal with nested `group` and `groupCollapsed` calls', () => {
  log(console, 'groupCollapsed', 'BRIDGE');
  log(console, 'group', 'BRIDGE');
  log(console, 'groupCollapsed', 'BRIDGE');
  log(console, 'groupEnd', 'BRIDGE');
  log(console, 'groupEnd', 'BRIDGE');
  log(console, 'groupEnd', 'BRIDGE');
  jest.runAllTimers();

  expect(console.log).not.toHaveBeenCalled();

  log(console, 'groupCollapsed', 'BRIDGE');
  log(console, 'group', 'BRIDGE');
  log(console, 'groupEnd', 'BRIDGE');
  log(console, 'groupCollapsed', 'BRIDGE');
  log(console, 'groupEnd', 'BRIDGE');
  log(console, 'groupEnd', 'BRIDGE');
  jest.runAllTimers();

  expect(console.log).not.toHaveBeenCalled();

  log(console, 'group', 'BRIDGE');
  log(console, 'groupCollapsed', 'BRIDGE');
  log(console, 'groupEnd', 'BRIDGE');
  log(console, 'groupCollapsed', 'BRIDGE');
  log(console, 'groupEnd', 'BRIDGE');
  log(console, 'groupEnd', 'BRIDGE');
  jest.runAllTimers();

  expect(console.log).toHaveBeenCalledTimes(1);

  log(console, 'groupCollapsed', 'BRIDGE');
  log(console, 'group', 'BRIDGE');
  log(console, 'groupEnd', 'BRIDGE');
  log(console, 'groupEnd', 'BRIDGE');
  log(console, 'log', 'BRIDGE', 'Banana');
  jest.runAllTimers();

  expect(console.log).toHaveBeenCalledTimes(2);
  expect(console.log).toHaveBeenCalledWith(' LOG ', 'Banana');
});
