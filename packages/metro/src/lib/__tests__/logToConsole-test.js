/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+react_native
 * @format
 */

/* eslint-disable no-console */

'use strict';

jest.useFakeTimers();

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
  console.warn = jest.fn();
  console.group = jest.fn();
  console.groupCollapsed = jest.fn();
  console.groupEnd = jest.fn();
});

test('invoke native console methods', () => {
  log('log', ['Banana']);
  log('warn', ['Apple']);
  log('warn', ['Kiwi']);
  jest.runAllTimers();

  expect(console.log).toHaveBeenCalledWith(' LOG ', 'Banana');
  expect(console.warn).toHaveBeenNthCalledWith(1, ' WARN ', 'Apple');
  expect(console.warn).toHaveBeenNthCalledWith(2, ' WARN ', 'Kiwi');
});

test('ignore `groupCollapsed` calls', () => {
  log('groupCollapsed', []);
  log('groupEnd', []);
  jest.runAllTimers();

  expect(console.groupCollapsed).not.toHaveBeenCalled();
});

test('warn if `groupCollapsed` and `groupEnd` are not balanced', () => {
  log('groupCollapsed', []);
  jest.runAllTimers();

  expect(console.warn).toHaveBeenCalledWith(
    ' WARN ',
    'Expected `console.groupEnd` to be called after `console.groupCollapsed`.',
  );

  // Ensure that the console resets the state and will accept new logs
  log('warn', ['Apple']);
  jest.runAllTimers();
  expect(console.warn).toHaveBeenCalledWith(' WARN ', 'Apple');
});

test('can deal with nested `group` and `groupCollapsed` calls', () => {
  log('groupCollapsed', []);
  log('group', []);
  log('groupCollapsed', []);
  log('groupEnd', []);
  log('groupEnd', []);
  log('groupEnd', []);
  jest.runAllTimers();

  expect(console.warn).not.toHaveBeenCalled();

  log('groupCollapsed', []);
  log('group', []);
  log('groupEnd', []);
  log('groupCollapsed', []);
  log('groupEnd', []);
  log('groupEnd', []);
  jest.runAllTimers();

  expect(console.warn).not.toHaveBeenCalled();

  log('group', []);
  log('groupCollapsed', []);
  log('groupEnd', []);
  log('groupCollapsed', []);
  log('groupEnd', []);
  log('groupEnd', []);
  jest.runAllTimers();

  expect(console.warn).not.toHaveBeenCalled();

  log('groupCollapsed', []);
  log('group', []);
  log('groupEnd', []);
  log('groupEnd', []);
  log('log', ['Banana']);
  jest.runAllTimers();

  expect(console.warn).not.toHaveBeenCalled();
  expect(console.log).toHaveBeenCalledWith(' LOG ', 'Banana');
});
